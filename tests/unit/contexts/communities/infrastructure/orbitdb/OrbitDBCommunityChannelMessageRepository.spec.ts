/* eslint-disable @typescript-eslint/require-await */
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityChannelMessageMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityChannelMessageMapper';
import OrbitDBCommunityChannelMessageRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessageRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { signedMutation } from '../../../public-mutations/support/signedMutation';

const identityMother = new IdentityMother();

const publicStorageGuard = () =>
  new PrivateCommunityPublicStorageGuard(
    {
      findScope: jest.fn().mockResolvedValue(undefined),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );

describe('OrbitDBCommunityChannelMessageRepository', () => {
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let headsGet: jest.Mock;
  let headsPut: jest.Mock;
  let messagesPut: jest.Mock;
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityChannelMessageRepository;

  beforeEach(() => {
    documents.splice(0);
    heads.clear();
    headsGet = jest.fn(async (key: string) => {
      const value = heads.get(key);

      return value ? { key, value } : undefined;
    });
    headsPut = jest.fn(async (key: string, value: Record<string, unknown>) => {
      heads.set(key, value);

      return 'ok';
    });
    messagesPut = jest.fn(async (storedDocument) => {
      upsertDocument(documents, storedDocument);

      return 'ok';
    });
    query = jest.fn(async (matcher) => documents.filter(matcher));
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    void registry.register('network-1', {
      heads: {
        get: headsGet,
        put: headsPut,
      },
      messages: {
        put: messagesPut,
        query,
      },
    } as never);
    repository = new OrbitDBCommunityChannelMessageRepository(
      registry,
      new OrbitDBCommunityChannelMessageMapper(),
      publicStorageGuard(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  async function saveDocuments(
    ...newDocuments: Record<string, unknown>[]
  ): Promise<void> {
    for (const newDocument of newDocuments) {
      await repository.save(
        CommunityChannelMessage.fromPrimitives(newDocument as never),
        await proofFor(String(newDocument.id), 'put', 1),
      );
    }

    await flushBackgroundTasks();
    query.mockClear();
  }

  it('should fetch syncable community messages without letting plaintext rows consume the limit', async () => {
    await saveDocuments(
      document({
        authorIdentityId: identityMother.id.valueOf(),
        createdAt: 1,
        encryptedPayload: undefined,
        id: 'plaintext-message',
        plaintextPayload: 'public text',
      }),
      document({
        authorIdentityId: identityMother.id.valueOf(),
        createdAt: 2,
        encryptedPayload: 'encrypted-a',
        id: 'encrypted-message-a',
        plaintextPayload: undefined,
      }),
      document({
        authorIdentityId: identityMother.id.valueOf(),
        createdAt: 3,
        encryptedPayload: 'encrypted-b',
        id: 'encrypted-message-b',
        plaintextPayload: undefined,
      }),
    );

    const messages = await repository.findSyncableByCommunity(
      new CommunityId('community-1'),
      1,
    );

    expect(messages.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({
        encryptedPayload: 'encrypted-b',
        id: 'encrypted-message-b',
      }),
    ]);
  });

  it('never reads or publishes protected community messages through OrbitDB', async () => {
    const protectedRepository = new OrbitDBCommunityChannelMessageRepository(
      registry,
      new OrbitDBCommunityChannelMessageMapper(),
      new PrivateCommunityPublicStorageGuard(
        {
          findScope: jest.fn().mockResolvedValue({}),
        } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );
    const message = CommunityChannelMessage.fromPrimitives(
      document({}) as never,
    );

    await expect(
      protectedRepository.save(message, await proofFor('message-1', 'put', 1)),
    ).rejects.toThrow('Invalid private authorization');
    await expect(
      protectedRepository.findByChannel(
        new CommunityId('community-1'),
        new CommunityChannelId('channel-1'),
        50,
      ),
    ).rejects.toThrow('Invalid private authorization');
    expect(messagesPut).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('should search only public channel messages', async () => {
    await saveDocuments(
      document({
        authorIdentityId: identityMother.id.valueOf(),
        channelId: 'channel-1',
        createdAt: 1,
        encryptedPayload: undefined,
        id: 'public-message',
        plaintextPayload: 'hello public channel',
      }),
      document({
        authorIdentityId: identityMother.id.valueOf(),
        channelId: 'channel-1',
        createdAt: 2,
        encryptedPayload: 'encrypted',
        id: 'encrypted-message',
        plaintextPayload: undefined,
      }),
    );

    const messages = await repository.searchPublicByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      'public',
      10,
    );

    expect(messages.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({
        id: 'public-message',
        plaintextPayload: 'hello public channel',
      }),
    ]);
  });

  it('should read channel messages from the replicated document store', async () => {
    await saveDocuments(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'message-1',
      }),
      document({
        channelId: 'channel-1',
        createdAt: 2,
        id: 'message-2',
      }),
      document({
        channelId: 'channel-2',
        createdAt: 3,
        id: 'message-3',
      }),
    );

    const firstPage = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      1,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(firstPage.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({ id: 'message-2' }),
    ]);
    expect(
      heads.get('community-channel-message-index:community-1:channel-1'),
    ).toBeUndefined();

    query.mockClear();

    const secondPage = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(secondPage.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({ id: 'message-1' }),
      expect.objectContaining({ id: 'message-2' }),
    ]);
  });

  it('should read a newly saved message from the replicated document store', async () => {
    const message = CommunityChannelMessage.fromPrimitives(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'message-1',
      }) as never,
    );

    await repository.save(message, await proofFor('message-1', 'put', 1));
    await flushBackgroundTasks();
    query.mockClear();

    const messages = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(messages.map((current) => current.toPrimitives())).toEqual([
      expect.objectContaining({ id: 'message-1' }),
    ]);
  });

  it('should persist the document before returning from save', async () => {
    const message = CommunityChannelMessage.fromPrimitives(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'message-1',
      }) as never,
    );
    let releaseDocumentWrite: () => void = () => undefined;
    const documentWrite = new Promise<void>((resolve) => {
      releaseDocumentWrite = resolve;
    });

    messagesPut.mockImplementationOnce(async (storedDocument) => {
      await documentWrite;
      upsertDocument(documents, storedDocument);

      return 'ok';
    });

    const save = repository.save(
      message,
      await proofFor('message-1', 'put', 1),
    );
    await flushBackgroundTasks();

    expect(
      heads.get('community-channel-message-index:community-1:channel-1'),
    ).toBeUndefined();
    expect(documents).toEqual([]);

    releaseDocumentWrite();
    await expect(save).resolves.toBeUndefined();
    expect(documents).toHaveLength(1);
  });

  it('should remove deleted messages from the channel message index', async () => {
    await saveDocuments(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'message-1',
      }),
    );

    await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );
    query.mockClear();

    await repository.delete(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      new CommunityChannelMessageId('message-1'),
      identityMother.id,
      await proofFor('message-1', 'delete', 2),
    );
    await flushBackgroundTasks();

    const messages = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(messages).toEqual([]);
  });

  it('should hide deleted messages from the channel message index immediately', async () => {
    await saveDocuments(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        encryptedPayload: 'encrypted-community-channel-message-payload',
        id: 'message-1',
      }),
    );

    await repository.delete(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      new CommunityChannelMessageId('message-1'),
      identityMother.id,
      await proofFor('message-1', 'delete', 2),
    );

    const messages = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(messages).toEqual([]);
  });

  it('should hide deleted messages when deletion follows a pending save index write', async () => {
    await repository.save(
      CommunityChannelMessage.fromPrimitives(
        document({
          channelId: 'channel-1',
          createdAt: 1,
          encryptedPayload: 'encrypted-community-channel-message-payload',
          id: 'message-1',
        }) as never,
      ),
      await proofFor('message-1', 'put', 1),
    );

    await repository.delete(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      new CommunityChannelMessageId('message-1'),
      identityMother.id,
      await proofFor('message-1', 'delete', 2),
    );

    const messages = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(messages).toEqual([]);
  });

  it('should hide deleted messages across repository instances', async () => {
    const mapper = new OrbitDBCommunityChannelMessageMapper();
    const senderRepository = new OrbitDBCommunityChannelMessageRepository(
      registry,
      mapper,
      publicStorageGuard(),
    );
    const deleterRepository = new OrbitDBCommunityChannelMessageRepository(
      registry,
      mapper,
      publicStorageGuard(),
    );
    const finderRepository = new OrbitDBCommunityChannelMessageRepository(
      registry,
      mapper,
      publicStorageGuard(),
    );

    await senderRepository.save(
      CommunityChannelMessage.fromPrimitives(
        document({
          channelId: 'channel-1',
          createdAt: 1,
          encryptedPayload: 'encrypted-community-channel-message-payload',
          id: 'message-1',
        }) as never,
      ),
      await proofFor('message-1', 'put', 1),
    );
    await deleterRepository.delete(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      new CommunityChannelMessageId('message-1'),
      identityMother.id,
      await proofFor('message-1', 'delete', 2),
    );

    const messages = await finderRepository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(messages).toEqual([]);
  });

  it('should build thread summaries for several channels from indexed messages', async () => {
    await saveDocuments(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'root-1',
      }),
      document({
        channelId: 'channel-1',
        createdAt: 2,
        id: 'reply-1',
        replyToMessageId: 'root-1',
      }),
      document({
        channelId: 'channel-2',
        createdAt: 3,
        id: 'root-2',
      }),
      document({
        channelId: 'channel-2',
        createdAt: 4,
        id: 'reply-2',
        replyToMessageId: 'root-2',
      }),
      document({
        channelId: 'channel-2',
        createdAt: 5,
        id: 'orphan-reply',
        replyToMessageId: 'missing-root',
      }),
    );

    const summaries = await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [
        new CommunityChannelId('channel-1'),
        new CommunityChannelId('channel-2'),
      ],
      2,
    );

    expect(query).toHaveBeenCalled();
    expect(
      summaries.get('channel-1')?.map((summary) => summary.toPrimitives()),
    ).toEqual([
      {
        lastReplyAt: 2,
        lastReplyMessageId: 'reply-1',
        replyCount: 1,
        rootMessageId: 'root-1',
      },
    ]);
    expect(
      summaries.get('channel-2')?.map((summary) => summary.toPrimitives()),
    ).toEqual([
      {
        lastReplyAt: 4,
        lastReplyMessageId: 'reply-2',
        replyCount: 1,
        rootMessageId: 'root-2',
      },
    ]);

    query.mockClear();
    const cachedSummaries = await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [
        new CommunityChannelId('channel-1'),
        new CommunityChannelId('channel-2'),
      ],
      2,
    );

    expect(query).toHaveBeenCalled();
    expect(cachedSummaries.get('channel-1')).toEqual(
      summaries.get('channel-1'),
    );
    expect(cachedSummaries.get('channel-2')).toEqual(
      summaries.get('channel-2'),
    );
  });

  it('should refresh thread summaries when saving a reply', async () => {
    await saveDocuments(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'root-1',
      }),
    );

    await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [new CommunityChannelId('channel-1')],
      2,
    );
    query.mockClear();

    await repository.save(
      CommunityChannelMessage.fromPrimitives(
        document({
          channelId: 'channel-1',
          createdAt: 2,
          id: 'reply-1',
          replyToMessageId: 'root-1',
        }) as never,
      ),
      await proofFor('reply-1', 'put', 1),
    );
    await flushBackgroundTasks();

    const summaries = await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [new CommunityChannelId('channel-1')],
      2,
    );

    expect(query).toHaveBeenCalled();
    expect(
      summaries.get('channel-1')?.map((summary) => summary.toPrimitives()),
    ).toEqual([
      {
        lastReplyAt: 2,
        lastReplyMessageId: 'reply-1',
        replyCount: 1,
        rootMessageId: 'root-1',
      },
    ]);
  });

  it('should refresh thread summaries when deleting a root message', async () => {
    await saveDocuments(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'root-1',
      }),
      document({
        channelId: 'channel-1',
        createdAt: 2,
        id: 'reply-1',
        replyToMessageId: 'root-1',
      }),
    );

    await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [new CommunityChannelId('channel-1')],
      2,
    );
    query.mockClear();

    await repository.delete(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      new CommunityChannelMessageId('root-1'),
      identityMother.id,
      await proofFor('root-1', 'delete', 2),
    );
    await flushBackgroundTasks();

    const summaries = await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [new CommunityChannelId('channel-1')],
      2,
    );

    expect(query).toHaveBeenCalled();
    expect(summaries.get('channel-1')).toEqual([]);
    expect(
      heads.get('community-channel-thread-summaries:community-1:channel-1')
        ?.summaries,
    ).toEqual([]);
  });
});

function proofFor(messageId: string, kind: 'put' | 'delete', sequence: number) {
  return signedMutation({
    identityId: identityMother.id.valueOf(),
    kind,
    recordId: `community:community-1:channel-1:${messageId}:${identityMother.id.valueOf()}`,
    sequence,
    store: 'messages',
  });
}

function document(
  overrides: Partial<ReturnType<CommunityChannelMessage['toPrimitives']>>,
): Record<string, unknown> {
  return {
    authorIdentityId: identityMother.id.valueOf(),
    channelId: 'channel-1',
    communityId: 'community-1',
    createdAt: 1780000000000,
    id: 'message-1',
    mentions: [],
    replyToMessageId: undefined,
    scopeType: 'community_channel',
    type: 'sent',
    ...overrides,
  };
}

function upsertDocument(
  currentDocuments: Record<string, unknown>[],
  newDocument: Record<string, unknown>,
): void {
  const existingIndex = currentDocuments.findIndex(
    (candidate) => candidate.id === newDocument.id,
  );

  if (existingIndex === -1) {
    currentDocuments.push(newDocument);

    return;
  }

  currentDocuments[existingIndex] = newDocument;
}

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve)).then(
    () => new Promise((resolve) => setImmediate(resolve)),
  );
}
