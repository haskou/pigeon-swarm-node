import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityChannelMessageMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityChannelMessageMapper';
import OrbitDBCommunityChannelMessageRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessageRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { IdentityMother } from '../../../../mothers/IdentityMother';

const identityMother = new IdentityMother();

describe('OrbitDBCommunityChannelMessageRepository', () => {
  const documents: Record<string, unknown>[] = [];
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCommunityChannelMessageRepository;

  beforeEach(() => {
    documents.splice(0);
    query = jest.fn(async (matcher) => documents.filter(matcher));
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', {
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

  it('should fetch syncable community messages without letting plaintext rows consume the limit', async () => {
    documents.push(
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
    documents.push(
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

  it('should build thread summaries for several channels with one messages query', async () => {
    documents.push(
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
      [new CommunityChannelId('channel-1'), new CommunityChannelId('channel-2')],
      2,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(summaries.get('channel-1')).toEqual([
      {
        lastReplyAt: 2,
        lastReplyMessageId: 'reply-1',
        replyCount: 1,
        rootMessageId: 'root-1',
      },
    ]);
    expect(summaries.get('channel-2')).toEqual([
      {
        lastReplyAt: 4,
        lastReplyMessageId: 'reply-2',
        replyCount: 1,
        rootMessageId: 'root-2',
      },
    ]);
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
