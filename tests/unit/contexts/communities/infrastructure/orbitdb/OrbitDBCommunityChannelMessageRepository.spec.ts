import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityChannelMessageMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityChannelMessageMapper';
import OrbitDBCommunityChannelMessageRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessageRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { IdentityMother } from '../../../../mothers/IdentityMother';

const identityMother = new IdentityMother();

describe('OrbitDBCommunityChannelMessageRepository', () => {
  const documents: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  let headsPut: jest.Mock;
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityChannelMessageRepository;

  beforeEach(() => {
    documents.splice(0);
    heads.clear();
    headsPut = jest.fn(async (key: string, value: Record<string, unknown>) => {
      heads.set(key, value);

      return 'ok';
    });
    query = jest.fn(async (matcher) => documents.filter(matcher));
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', {
      heads: {
        get: jest.fn(async (key: string) => {
          const value = heads.get(key);

          return value ? { key, value } : undefined;
        }),
        put: headsPut,
      },
      messages: {
        put: jest.fn(async (document) => {
          upsertDocument(documents, document);

          return 'ok';
        }),
        query,
      },
    } as never);
    repository = new OrbitDBCommunityChannelMessageRepository(
      registry,
      new OrbitDBCommunityChannelMessageMapper(),
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
      );
    }

    await flushBackgroundTasks();
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

  it('should reuse the channel message index', async () => {
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

    expect(query).not.toHaveBeenCalled();
    expect(firstPage.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({ id: 'message-2' }),
    ]);
    expect(
      heads.get('community-channel-message-index:community-1:channel-1'),
    ).toEqual(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ id: 'message-1' }),
          expect.objectContaining({ id: 'message-2' }),
        ]),
      }),
    );

    query.mockClear();

    const secondPage = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(query).not.toHaveBeenCalled();
    expect(secondPage.map((message) => message.toPrimitives())).toEqual([
      expect.objectContaining({ id: 'message-1' }),
      expect.objectContaining({ id: 'message-2' }),
    ]);
  });

  it('should update the channel message index when saving a message', async () => {
    const message = CommunityChannelMessage.fromPrimitives(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'message-1',
      }) as never,
    );

    await repository.save(message);
    await flushBackgroundTasks();
    query.mockClear();

    const messages = await repository.findByChannel(
      new CommunityId('community-1'),
      new CommunityChannelId('channel-1'),
      50,
    );

    expect(query).not.toHaveBeenCalled();
    expect(messages.map((current) => current.toPrimitives())).toEqual([
      expect.objectContaining({ id: 'message-1' }),
    ]);
  });

  it('should not wait for channel message index writes when saving a message', async () => {
    const message = CommunityChannelMessage.fromPrimitives(
      document({
        channelId: 'channel-1',
        createdAt: 1,
        id: 'message-1',
      }) as never,
    );

    headsPut.mockImplementationOnce(() => new Promise<string>(() => undefined));

    await expect(repository.save(message)).resolves.toBeUndefined();
    expect(documents).toEqual([expect.objectContaining({ id: 'message-1' })]);
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
    );
    await flushBackgroundTasks();

    const messages = await repository.findByChannel(
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

    expect(query).not.toHaveBeenCalled();
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

    expect(query).not.toHaveBeenCalled();
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
    );
    await flushBackgroundTasks();

    const summaries = await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [new CommunityChannelId('channel-1')],
      2,
    );

    expect(query).not.toHaveBeenCalled();
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
    );
    await flushBackgroundTasks();

    const summaries = await repository.findThreadSummariesByChannel(
      new CommunityId('community-1'),
      [new CommunityChannelId('channel-1')],
      2,
    );

    expect(query).not.toHaveBeenCalled();
    expect(summaries.get('channel-1')).toEqual([]);
  });
});

function document(
  overrides: Partial<ReturnType<CommunityChannelMessage['toPrimitives']>>,
): Record<string, unknown> {
  return {
    attachmentExternalIdentifiers: [],
    authorIdentityId: identityMother.id.valueOf(),
    channelId: 'channel-1',
    communityId: 'community-1',
    createdAt: 1780000000000,
    id: 'message-1',
    mentions: [],
    replyToMessageId: undefined,
    scopeType: 'community_channel',
    signature: identityMother.signature.valueOf(),
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
