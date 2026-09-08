import { Call } from '@app/contexts/calls/domain/Call';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { OrbitDBCallDocument } from '@app/contexts/calls/infrastructure/orbitdb/documents/OrbitDBCallDocument';
import OrbitDBCallMapper from '@app/contexts/calls/infrastructure/orbitdb/mappers/OrbitDBCallMapper';
import OrbitDBCallDocumentReplicator from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentReplicator';
import OrbitDBCallDocumentMerger from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentMerger';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

type UpdateHandler = (entry: { payload?: { value?: unknown } }) => void;

function createStore(initialDocuments: Record<string, unknown>[] = []) {
  const entries = new Map(
    initialDocuments.map((document) => [String(document.id), document]),
  );
  const updateHandlers: UpdateHandler[] = [];

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    emitUpdate(document: Record<string, unknown>): void {
      for (const handler of updateHandlers) {
        handler({ payload: { value: document } });
      }
    },
    events: {
      on: jest.fn((event: string, handler: UpdateHandler) => {
        if (event === 'update') {
          updateHandlers.push(handler);
        }
      }),
    },
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(
      async (
        keyOrDocument: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);
        const document =
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument;

        entries.set(key, document);

        return key;
      },
    ),
  };
}

describe('OrbitDBCallRepository', () => {
  const creatorIdentityId =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const participantIdentityId =
    'MCowBQYDK2VwAyEAwRhK+CGU7bzgh7bzBS8SIn3jGiI7i4AqA9KX6niQ2pc=';
  const callId = '550e8400-e29b-41d4-a716-446655440001';
  const networkId = '550e8400-e29b-41d4-a716-446655440002';
  const communityId = new CommunityId('community-1');
  const channelId = new CommunityChannelId('channel-1');
  let calls: ReturnType<typeof createStore>;
  let heads: ReturnType<typeof createStore>;
  let projection: OrbitDBCallProjection;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCallRepository;

  function communityCall(status: 'active' | 'ended' = 'active'): Call {
    return Call.fromPrimitives({
      createdAt: 1_780_000_000_000,
      creatorIdentityId,
      endedAt: status === 'ended' ? 1_780_000_005_000 : undefined,
      endedByIdentityId: status === 'ended' ? creatorIdentityId : undefined,
      id: callId,
      networkId,
      participantIds: [creatorIdentityId, participantIdentityId],
      participants: [
        {
          identityId: creatorIdentityId,
          joinedAt: 1_780_000_000_000,
          status: 'joined',
        },
        {
          identityId: participantIdentityId,
          status: 'ringing',
        },
      ],
      scope: {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        conversationId: undefined,
        type: 'community_channel',
      },
      status,
    });
  }

  function document(
    status: 'active' | 'ended' = 'active',
    updatedAt = 1_780_000_000_000,
  ): OrbitDBCallDocument {
    return {
      ...new OrbitDBCallMapper().toDocument(communityCall(status)),
      updatedAt,
    };
  }

  async function createRepository(
    initialDocuments: OrbitDBCallDocument[] = [],
  ): Promise<void> {
    calls = createStore(initialDocuments);
    heads = createStore();
    registry = new OrbitDBReplicatedStateRegistry();
    await registry.register(networkId, { calls, heads } as never);
    projection = new OrbitDBCallProjection(
      registry,
      new OrbitDBCallDocumentMerger(),
      new OrbitDBCallDocumentReplicator(registry),
    );
    repository = new OrbitDBCallRepository(
      new OrbitDBCallMapper(),
      new OrbitDBCallDocumentReplicator(registry),
      projection,
    );
    await projection.start();
  }

  beforeEach(async () => {
    await createRepository();
  });

  afterEach(() => {
    registry.clear();
  });

  it.each([true, false])('does not expose historical active calls while a running projection replays (success=%s)', async (success) => {
    const subscribe = jest.spyOn(registry, 'onDocumentUpdated');
    const laterProjection = new OrbitDBCallProjection(registry, new OrbitDBCallDocumentMerger(), new OrbitDBCallDocumentReplicator(registry));

    await laterProjection.start();
    const observer = subscribe.mock.calls[0][2]!.historyObserver!;
    const scope = {};
    observer.started(scope);
    await subscribe.mock.calls[0][1](document(), scope);
    await flushBackgroundTasks();

    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toEqual([]);
    await expect(laterProjection.findTimedOutRingingCalls(new Timestamp(1_780_000_010_000))).resolves.toEqual([]);
    await subscribe.mock.calls[0][1](document('ended', 1_780_000_005_000), scope);
    await flushBackgroundTasks();
    observer.finished(scope, success);
    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toEqual([]);
    if (!success) await expect(laterProjection.findById(new CallId(callId))).resolves.toBeUndefined();
  });

  it('keeps a successful replay when an overlapping replay fails', async () => {
    const subscribe = jest.spyOn(registry, 'onDocumentUpdated');
    const laterProjection = new OrbitDBCallProjection(registry, new OrbitDBCallDocumentMerger(), new OrbitDBCallDocumentReplicator(registry));

    await laterProjection.start();
    const observer = subscribe.mock.calls[0][2]!.historyObserver!;
    const listener = subscribe.mock.calls[0][1];
    const first = {};
    const second = {};
    const secondDocument = { ...document(), id: '550e8400-e29b-41d4-a716-446655440099' };
    observer.started(first);
    observer.started(second);
    await listener(document(), first);
    await listener(secondDocument, second);
    observer.finished(first, true);
    observer.finished(second, false);

    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toHaveLength(1);
    observer.started(second);
    await listener(secondDocument, second);
    observer.finished(second, true);
    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toHaveLength(2);
  });

  it('writes one canonical OrbitDB document without replicated call heads', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();

    expect(calls.put).toHaveBeenCalledTimes(1);
    expect(heads.put).not.toHaveBeenCalled();
    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
  });

  it('rejects reads until canonical documents have been projected', async () => {
    const unstartedProjection = new OrbitDBCallProjection(
      registry,
      new OrbitDBCallDocumentMerger(),
      new OrbitDBCallDocumentReplicator(registry),
    );
    const unstartedRepository = new OrbitDBCallRepository(
      new OrbitDBCallMapper(),
      new OrbitDBCallDocumentReplicator(registry),
      unstartedProjection,
    );

    await expect(
      unstartedRepository.findById(new CallId(callId)),
    ).rejects.toMatchObject({ code: 503020, httpCode: 503 });
  });

  it('starts the local projection only once', async () => {
    await projection.start();

    expect(calls.events.on).toHaveBeenCalledTimes(2);
    expect(calls.events.on).toHaveBeenCalledWith(
      'update',
      expect.any(Function),
    );
    expect(calls.events.on).toHaveBeenCalledWith('join', expect.any(Function));
  });

  it('keeps all call queries current from the local projection', async () => {
    await repository.save(communityCall());

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toHaveLength(1);
    await expect(
      repository.findActiveByCommunityChannel(communityId, channelId),
    ).resolves.toBeDefined();
    await expect(
      repository.findByParticipant(new IdentityId(participantIdentityId)),
    ).resolves.toHaveLength(1);
    await expect(
      repository.findTimedOutRingingCalls(new Timestamp(1_780_000_000_000)),
    ).resolves.toHaveLength(1);

    await repository.save(communityCall('ended'));

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
  });

  it('bootstraps the local projection from canonical OrbitDB documents', async () => {
    registry.clear();
    await createRepository([document()]);

    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
    await expect(
      repository.findActiveByCommunityChannel(communityId, channelId),
    ).resolves.toBeDefined();
  });

  it('projects newer documents replicated by OrbitDB', async () => {
    calls.emitUpdate(document('active'));
    calls.emitUpdate(document('ended', 1_780_000_005_000));
    await flushBackgroundTasks();

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
    await expect(repository.findById(new CallId(callId))).resolves.toEqual(
      expect.objectContaining({ getId: expect.any(Function) }),
    );
  });

  it('ignores stale replicated documents', async () => {
    calls.emitUpdate(document('ended', 1_780_000_005_000));
    calls.emitUpdate(document('active', 1_780_000_000_000));
    await flushBackgroundTasks();

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
  });

  it.each(['forward', 'reverse'] as const)(
    'preserves both participants latest rejoins from competing snapshots in %s order',
    async (order) => {
      const creatorRejoined = {
        identityId: creatorIdentityId,
        joinedAt: 1_780_000_000_200,
        status: 'joined',
      };
      const participantRejoined = {
        identityId: participantIdentityId,
        joinedAt: 1_780_000_000_210,
        status: 'joined',
      };
      const creatorSnapshot: OrbitDBCallDocument = {
        ...document('active', 1_780_000_000_200),
        participants: [
          creatorRejoined,
          {
            identityId: participantIdentityId,
            joinedAt: 1_780_000_000_000,
            leftAt: 1_780_000_000_100,
            status: 'left',
          },
        ],
      };
      const participantSnapshot: OrbitDBCallDocument = {
        ...document('active', 1_780_000_000_210),
        participants: [
          {
            identityId: creatorIdentityId,
            joinedAt: 1_780_000_000_000,
            leftAt: 1_780_000_000_100,
            status: 'left',
          },
          participantRejoined,
        ],
      };
      const snapshots = [creatorSnapshot, participantSnapshot];

      const orderedSnapshots =
        order === 'forward' ? snapshots : snapshots.reverse();

      for (const snapshot of orderedSnapshots) {
        calls.emitUpdate(snapshot);
      }
      await flushBackgroundTasks();

      const call = await repository.findById(new CallId(callId));

      expect(call).toBeDefined();
      for (const identityId of [creatorIdentityId, participantIdentityId]) {
        expect(() =>
          call!.assertParticipantCanHeartbeat(new IdentityId(identityId)),
        ).not.toThrow();
      }
      expect(call!.toPrimitives().participants).toEqual([
        creatorRejoined,
        participantRejoined,
      ]);
    },
  );

  it('registers gossip replicas for immediate reads without persistence', async () => {
    await repository.registerReplica(communityCall());

    expect(calls.put).not.toHaveBeenCalled();
    expect(heads.put).not.toHaveBeenCalled();
    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
  });

  it('does not persist stale gossip projections as durable repairs', async () => {
    calls.emitUpdate(document('ended', 1_780_000_005_000));
    await flushBackgroundTasks();
    calls.put.mockClear();

    await repository.registerReplica(communityCall());
    await repository.registerReplica(communityCall());
    await flushBackgroundTasks();

    expect(calls.put).not.toHaveBeenCalled();
    await expect(repository.findActiveByCommunity(communityId)).resolves.toEqual([]);
  });

  it('does not wait for canonical document replication', async () => {
    calls.put.mockImplementationOnce(() => new Promise(() => undefined));

    const result = await Promise.race([
      repository.save(communityCall()).then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('saved');
    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
  });
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
