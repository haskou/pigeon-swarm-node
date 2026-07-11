import { OrbitDBCallDocument } from '@app/contexts/calls/infrastructure/orbitdb/documents/OrbitDBCallDocument';
import OrbitDBCallDocumentReplicator from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentReplicator';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import Kernel from '@haskou/ddd-kernel';
import { mock, MockProxy } from 'jest-mock-extended';

describe('OrbitDBCallDocumentReplicator', () => {
  let registry: MockProxy<OrbitDBReplicatedStateRegistry>;
  let replicator: OrbitDBCallDocumentReplicator;
  let logger: MockProxy<WinstonLogger>;

  beforeEach(() => {
    registry = mock<OrbitDBReplicatedStateRegistry>();
    logger = mock<WinstonLogger>();
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(logger);
    replicator = new OrbitDBCallDocumentReplicator(registry);
  });

  it('coalesces obsolete call states while persistence is busy', async () => {
    const persistedStatuses: string[] = [];
    let releaseFirstWrite: () => void = () => undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    registry.putDocument.mockImplementation(async (_store, document) => {
      persistedStatuses.push(String(document.status));

      if (persistedStatuses.length === 1) {
        await firstWrite;
      }
    });

    replicator.replicate(callDocument('active'));
    replicator.replicate(callDocument('ended'));
    replicator.replicate(callDocument('active'));
    await flushBackgroundTasks();

    expect(persistedStatuses).toEqual(['active']);

    releaseFirstWrite();
    await flushBackgroundTasks();
    await flushBackgroundTasks();

    expect(persistedStatuses).toEqual(['active', 'active']);
  });

  it('starts a new replication after a failed write', async () => {
    registry.putDocument
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce();

    replicator.replicate(callDocument('active'));
    await flushBackgroundTasks();
    replicator.replicate(callDocument('ended'));
    await flushBackgroundTasks();

    expect(registry.putDocument).toHaveBeenCalledTimes(2);
    expect(registry.putDocument).toHaveBeenLastCalledWith(
      'calls',
      expect.objectContaining({ status: 'ended' }),
      ['network-1'],
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Call document replication failed: callId=call-1 error=Error: unavailable',
    );
  });
});

function callDocument(status: string): OrbitDBCallDocument {
  return {
    createdAt: 1780000000000,
    creatorIdentityId: 'identity-1',
    id: 'call-1',
    networkId: 'network-1',
    participantIds: ['identity-1'],
    participants: [{ identityId: 'identity-1', status: 'joined' }],
    scope: {
      channelId: 'channel-1',
      communityId: 'community-1',
      conversationId: undefined,
      type: 'community_channel',
    },
    status,
    updatedAt: 1780000000000,
  };
}

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
