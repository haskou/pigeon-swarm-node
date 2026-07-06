import OrbitDBMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMetadataHeadRepairer';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

describe('OrbitDBMetadataHeadRepairer', () => {
  const calls: Record<string, unknown>[] = [];
  const heads = new Map<string, Record<string, unknown>>();
  const communities: Record<string, unknown>[] = [];
  const conversations: Record<string, unknown>[] = [];
  const identities: Record<string, unknown>[] = [];
  const keychains: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const notifications: Record<string, unknown>[] = [];
  const pins: Record<string, unknown>[] = [];
  const polls: Record<string, unknown>[] = [];
  const presence: Record<string, unknown>[] = [];
  const reactions: Record<string, unknown>[] = [];
  let registry: OrbitDBReplicatedStateRegistry;
  let repairer: OrbitDBMetadataHeadRepairer;

  beforeEach(() => {
    calls.splice(0);
    heads.clear();
    communities.splice(0);
    conversations.splice(0);
    identities.splice(0);
    keychains.splice(0);
    messages.splice(0);
    notifications.splice(0);
    pins.splice(0);
    polls.splice(0);
    presence.splice(0);
    reactions.splice(0);
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register(
      'network-1',
      replicatedStores({
        calls,
        communities,
        conversations,
        heads,
        identities,
        keychains,
        messages,
        notifications,
        pins,
        polls,
        presence,
        reactions,
      }),
    );
    repairer = new OrbitDBMetadataHeadRepairer(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should repair community, identity and keychain heads from latest metadata documents', async () => {
    communities.push({
      createdAt: 1,
      description: 'Community',
      id: 'community-1',
      memberIds: ['identity-1'],
      name: 'Community',
      networkId: 'network-1',
      ownerIdentityId: 'identity-1',
      textChannels: [],
      visibility: 'private',
    });
    heads.set('identity:identity-1', {
      cid: 'identity-v1',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      receivedAt: 1,
      version: 1,
    });
    heads.set('keychain:identity-1', {
      cid: 'keychain-v1',
      id: 'identity-1',
      ownerIdentityId: 'identity-1',
      receivedAt: 1,
      version: 1,
    });
    identities.push(
      {
        cid: 'identity-v1',
        id: 'identity-1',
        identityId: 'identity-1',
        networkIds: ['network-1'],
        receivedAt: 1,
        version: 1,
      },
      {
        cid: 'identity-v2',
        handle: 'hasko',
        id: 'identity-1',
        lastEventId: 'event-identity-v2',
        networkIds: ['network-1'],
        receivedAt: 2,
        version: 2,
      },
      {
        cid: 'bafyimage',
        contentType: 'image/png',
        id: 'bafyimage',
        networkIds: ['network-1'],
        receivedAt: 3,
        sizeBytes: 123,
        version: 1,
      },
    );
    keychains.push(
      {
        cid: 'keychain-v1',
        id: 'identity-1',
        ownerIdentityId: 'identity-1',
        receivedAt: 1,
        version: 1,
      },
      {
        cid: 'keychain-v2',
        id: 'identity-1',
        ownerIdentityId: 'identity-1',
        receivedAt: 2,
        version: 2,
      },
    );
    conversations.push({
      createdAt: 3,
      id: 'conversation-1',
      networkId: 'network-1',
      participantIds: ['identity-1'],
      type: 'group',
    });
    messages.push(
      {
        attachmentExternalIdentifiers: [],
        authorIdentityId: 'identity-1',
        channelId: 'channel-1',
        communityId: 'community-1',
        createdAt: 1,
        id: 'root-1',
        scopeType: 'community_channel',
        type: 'sent',
      },
      {
        attachmentExternalIdentifiers: [],
        authorIdentityId: 'identity-1',
        channelId: 'channel-1',
        communityId: 'community-1',
        createdAt: 2,
        id: 'reply-1',
        replyToMessageId: 'root-1',
        scopeType: 'community_channel',
        type: 'sent',
      },
      {
        attachmentExternalIdentifiers: [],
        authorId: 'identity-1',
        conversationId: 'conversation-1',
        createdAt: 3,
        id: 'conversation-message-1',
        messageId: 'conversation-message-1',
        previousMessageIds: [],
        scopeType: 'conversation',
        signature: 'signature',
        type: 'sent',
      },
    );
    pins.push(
      {
        conversationId: 'conversation-1',
        createdAt: 3,
        id: 'conversation-pin-1',
        messageId: 'conversation-message-1',
        pinnedByIdentityId: 'identity-1',
      },
      {
        channelId: 'channel-1',
        communityId: 'community-1',
        createdAt: 4,
        id: 'community-pin-1',
        messageId: 'root-1',
        pinnedByIdentityId: 'identity-1',
      },
    );
    reactions.push(
      {
        authorId: 'identity-1',
        conversationId: 'conversation-1',
        createdAt: 5,
        emoji: 'ok',
        id: 'conversation-reaction-1',
        messageId: 'conversation-message-1',
        scopeType: 'conversation',
      },
      {
        authorIdentityId: 'identity-1',
        channelId: 'channel-1',
        communityId: 'community-1',
        createdAt: 6,
        emoji: 'ok',
        id: 'community-reaction-1',
        messageId: 'root-1',
        scopeType: 'community_channel',
      },
    );
    polls.push(
      {
        allowsMultipleVotes: false,
        createdAt: 7,
        creatorIdentityId: 'identity-1',
        id: 'community-poll-1',
        networkId: 'network-1',
        options: [],
        question: 'Question',
        scope: {
          channelId: 'channel-1',
          communityId: 'community-1',
          networkId: 'network-1',
          type: 'community_channel',
        },
        status: 'open',
        votes: [],
      },
      {
        allowsMultipleVotes: false,
        createdAt: 8,
        creatorIdentityId: 'identity-1',
        id: 'conversation-poll-1',
        networkId: 'network-1',
        options: [],
        question: 'Question',
        scope: {
          conversationId: 'conversation-1',
          networkId: 'network-1',
          type: 'group_conversation',
        },
        status: 'open',
        votes: [],
      },
    );
    calls.push({
      createdAt: 9,
      creatorIdentityId: 'identity-1',
      id: 'call-1',
      networkId: 'network-1',
      participantIds: ['identity-1'],
      participants: [{ identityId: 'identity-1', status: 'joined' }],
      scope: {
        conversationId: 'conversation-1',
        type: 'conversation',
      },
      status: 'active',
    });
    notifications.push({
      createdAt: 10,
      id: 'notification-1',
      payload: { conversationId: 'conversation-1' },
      recipientIdentityId: 'identity-1',
      state: 'unread',
      status: 'visible',
      type: 'conversation_invitation',
    });
    presence.push({
      id: 'identity-1',
      identityId: 'identity-1',
      status: 'available',
      updatedAt: 11,
    });

    await expect(repairer.repair()).resolves.toEqual({
      callIndexes: 3,
      communities: 1,
      communityChannelMessageIndexes: 1,
      communityChannelPinIndexes: 1,
      communityThreadSummaries: 1,
      conversationMessageIndexes: 1,
      conversationParticipantIndexes: 1,
      conversations: 1,
      conversationPinIndexes: 1,
      identities: 1,
      keychains: 1,
      notificationIndexes: 1,
      pollIndexes: 2,
      presenceHeads: 1,
      reactionIndexes: 2,
    });
    expect(heads.get('community:community-1')).toEqual(
      expect.objectContaining({ id: 'community-1' }),
    );
    expect(heads.get('community-member-index:identity-1')).toEqual(
      expect.objectContaining({
        communities: [expect.objectContaining({ id: 'community-1' })],
      }),
    );
    expect(heads.get('identity:identity-1')).toEqual(
      expect.objectContaining({ cid: 'identity-v2', version: 2 }),
    );
    expect(heads.get('identity-handle:hasko')).toEqual(
      expect.objectContaining({ cid: 'identity-v2', version: 2 }),
    );
    expect(heads.get('identity:bafyimage')).toBeUndefined();
    expect(heads.get('keychain:identity-1')).toEqual(
      expect.objectContaining({ cid: 'keychain-v2', version: 2 }),
    );
    expect(
      heads.get('community-channel-thread-summaries:community-1:channel-1'),
    ).toEqual(
      expect.objectContaining({
        summaries: [
          {
            lastReplyAt: 2,
            lastReplyMessageId: 'reply-1',
            replyCount: 1,
            rootMessageId: 'root-1',
          },
        ],
      }),
    );
    expect(
      heads.get('community-channel-message-index:community-1:channel-1'),
    ).toEqual(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ id: 'root-1' }),
          expect.objectContaining({ id: 'reply-1' }),
        ],
      }),
    );
    expect(heads.get('conversation-message-index:conversation-1')).toEqual(
      expect.objectContaining({
        messages: [
          expect.objectContaining({ id: 'conversation-message-1' }),
        ],
      }),
    );
    expect(heads.get('conversation:conversation-1')).toEqual(
      expect.objectContaining({ id: 'conversation-1' }),
    );
    expect(heads.get('conversation-participant-index:identity-1')).toEqual(
      expect.objectContaining({
        conversations: [expect.objectContaining({ id: 'conversation-1' })],
      }),
    );
    expect(heads.get('conversation-pin-index:conversation-1')).toEqual(
      expect.objectContaining({
        pins: [expect.objectContaining({ id: 'conversation-pin-1' })],
      }),
    );
    expect(
      heads.get('community-channel-pin-index:community-1:channel-1'),
    ).toEqual(
      expect.objectContaining({
        pins: [expect.objectContaining({ id: 'community-pin-1' })],
      }),
    );
    expect(heads.get('conversation-reaction-index:conversation-1')).toEqual(
      expect.objectContaining({
        reactions: [
          expect.objectContaining({ id: 'conversation-reaction-1' }),
        ],
      }),
    );
    expect(heads.get('community-reaction-index:community-1')).toEqual(
      expect.objectContaining({
        reactions: [expect.objectContaining({ id: 'community-reaction-1' })],
      }),
    );
    expect(
      heads.get('poll-community-channel-index:community-1:channel-1'),
    ).toEqual(
      expect.objectContaining({
        polls: [expect.objectContaining({ id: 'community-poll-1' })],
      }),
    );
    expect(heads.get('poll-group-conversation-index:conversation-1')).toEqual(
      expect.objectContaining({
        polls: [expect.objectContaining({ id: 'conversation-poll-1' })],
      }),
    );
    expect(heads.get('call-active-index')).toEqual(
      expect.objectContaining({
        calls: [expect.objectContaining({ id: 'call-1' })],
      }),
    );
    expect(heads.get('call-participant-index:identity-1')).toEqual(
      expect.objectContaining({
        calls: [expect.objectContaining({ id: 'call-1' })],
      }),
    );
    expect(heads.get('call-conversation-index:conversation-1')).toEqual(
      expect.objectContaining({
        calls: [expect.objectContaining({ id: 'call-1' })],
      }),
    );
    expect(heads.get('notification-recipient-index:identity-1')).toEqual(
      expect.objectContaining({
        notifications: [expect.objectContaining({ id: 'notification-1' })],
      }),
    );
    expect(heads.get('presence:identity-1')).toEqual(
      expect.objectContaining({ identityId: 'identity-1' }),
    );
  });

  it('should repair a single replicated document store', async () => {
    identities.push({
      cid: 'identity-v1',
      handle: 'hasko',
      id: 'identity-1',
      identityId: 'identity-1',
      networkIds: ['network-1'],
      receivedAt: 1,
      version: 1,
    });
    keychains.push({
      cid: 'keychain-v1',
      id: 'identity-1',
      ownerIdentityId: 'identity-1',
      receivedAt: 1,
      version: 1,
    });

    await expect(repairer.repairStore('identities')).resolves.toEqual({
      identities: 1,
    });

    expect(heads.get('identity:identity-1')).toEqual(
      expect.objectContaining({ id: 'identity-1' }),
    );
    expect(heads.get('identity-handle:hasko')).toEqual(
      expect.objectContaining({ id: 'identity-1' }),
    );
    expect(heads.get('keychain:identity-1')).toBeUndefined();
  });
});

function queryableStore(documents: Record<string, unknown>[]) {
  return {
    query: jest.fn(
      async (matcher: (document: Record<string, unknown>) => boolean) =>
        documents.filter(matcher),
    ),
  };
}

function replicatedStores(stores: {
  calls: Record<string, unknown>[];
  communities: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  heads: Map<string, Record<string, unknown>>;
  identities: Record<string, unknown>[];
  keychains: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  pins: Record<string, unknown>[];
  polls: Record<string, unknown>[];
  presence: Record<string, unknown>[];
  reactions: Record<string, unknown>[];
}) {
  return {
    calls: queryableStore(stores.calls),
    heads: {
      all: jest.fn(async () =>
        [...stores.heads.entries()].map(([key, value]) => ({ key, value })),
      ),
      get: jest.fn(async (key: string) => {
        const value = stores.heads.get(key);

        return value ? { key, value } : undefined;
      }),
      put: jest.fn(async (key: string, value: Record<string, unknown>) => {
        stores.heads.set(key, value);

        return 'ok';
      }),
    },
    communities: queryableStore(stores.communities),
    conversations: queryableStore(stores.conversations),
    identities: queryableStore(stores.identities),
    keychains: queryableStore(stores.keychains),
    messages: queryableStore(stores.messages),
    notifications: queryableStore(stores.notifications),
    pins: queryableStore(stores.pins),
    polls: queryableStore(stores.polls),
    presence: queryableStore(stores.presence),
    reactions: queryableStore(stores.reactions),
  } as never;
}
