import { CommunityInviteWasAcceptedEvent } from '@app/contexts/communities/domain/events/CommunityInviteWasAcceptedEvent';
import { CommunityInviteWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityInviteWasCreatedEvent';
import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import { CommunityMembershipRequestWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasCreatedEvent';
import { CommunityWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityWasCreatedEvent';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { ContentReplicationWasClaimedEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasClaimedEvent';
import { ContentReplicationWasRegisteredEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasRegisteredEvent';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import { NotificationWasAcceptedEvent } from '@app/contexts/notifications/domain/events/NotificationWasAcceptedEvent';
import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';
import OrbitDBDomainEventProjector from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDomainEventProjector';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import { ReplicatedDomainEventMessage } from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedDomainEventMessage';

type FakeStore = {
  put: jest.Mock;
};

function fakeStore(): FakeStore {
  return {
    put: jest.fn().mockResolvedValue('ok'),
  };
}

function fakeStores(): Record<string, FakeStore> {
  return {
    communities: fakeStore(),
    conversations: fakeStore(),
    heads: fakeStore(),
    identities: fakeStore(),
    contentReplication: fakeStore(),
    keychains: fakeStore(),
    messages: fakeStore(),
    notifications: fakeStore(),
    reactions: fakeStore(),
    requests: fakeStore(),
  };
}

function storesFrom(
  stores: Record<string, FakeStore>,
): OrbitDBReplicatedStateStores {
  return stores as unknown as OrbitDBReplicatedStateStores;
}

function replicatedMessage(
  type: string,
  attributes: Record<string, unknown>,
  aggregateId = 'aggregate-id',
): ReplicatedDomainEventMessage {
  return {
    aggregate_id: aggregateId,
    attributes,
    event: type,
    event_id: `${type}:event-id`,
    exchange: 'domain_events',
    occurred_on: 1780000000000,
    replication: {
      networkId: 'network-1',
      originPeerId: 'peer-1',
    },
    retries: 0,
    routingKey: type,
    type,
    user_id: '',
  };
}

describe('OrbitDBDomainEventProjector', () => {
  const projector = new OrbitDBDomainEventProjector();

  it('projects identity and keychain events into direct lookup heads', async () => {
    const stores = fakeStores();

    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        IdentityWasCreatedEvent.EVENT_NAME,
        {
          externalIdentifier: 'bafyidentity',
          handle: 'hasko',
          networkIds: ['network-1'],
          version: 1,
        },
        'identity-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        KeychainWasPublishedEvent.EVENT_NAME,
        {
          externalIdentifier: 'bafykeychain',
          ownerIdentityId: 'identity-1',
          version: 2,
        },
        'identity-1',
      ),
    );

    expect(stores.identities.put).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafyidentity',
        handle: 'hasko',
        id: 'identity-1',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'identity:identity-1',
      expect.objectContaining({
        cid: 'bafyidentity',
        id: 'identity-1',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'identity-handle:hasko',
      expect.objectContaining({
        cid: 'bafyidentity',
        id: 'identity-1',
      }),
    );
    expect(stores.keychains.put).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafykeychain',
        id: 'identity-1',
        ownerIdentityId: 'identity-1',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'keychain:identity-1',
      expect.objectContaining({
        cid: 'bafykeychain',
        ownerIdentityId: 'identity-1',
      }),
    );
  });

  it('projects conversation events into replicated read model stores', async () => {
    const stores = fakeStores();

    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ConversationWasCreatedEvent.EVENT_NAME,
        {
          conversation: {
            id: 'conversation-1',
            name: 'group',
            networkId: 'network-1',
            participantIds: ['identity-1', 'identity-2'],
            type: 'group',
          },
        },
        'conversation-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ConversationMessageWasSentEvent.EVENT_NAME,
        {
          message: {
            conversationId: 'conversation-1',
            encryptedPayload: 'payload',
            id: 'message-1',
            type: 'sent',
          },
          messageId: 'message-1',
        },
        'conversation-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ConversationMessageReactionWasAddedEvent.EVENT_NAME,
        {
          authorId: 'identity-1',
          conversationId: 'conversation-1',
          createdAt: 1780000000000,
          emoji: ':thumbsup:',
          messageId: 'message-1',
        },
        'conversation-1',
      ),
    );

    expect(stores.conversations.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conversation-1',
        lastEventType: ConversationWasCreatedEvent.EVENT_NAME,
      }),
    );
    expect(stores.messages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        id: 'message-1',
        scopeType: 'conversation',
      }),
    );
    expect(stores.reactions.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conversation:conversation-1:message-1:identity-1::thumbsup:',
        removed: false,
        scopeType: 'conversation',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      `event:${ConversationWasCreatedEvent.EVENT_NAME}:conversation-1`,
      expect.objectContaining({
        eventId: `${ConversationWasCreatedEvent.EVENT_NAME}:event-id`,
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'conversation:conversation-1',
      expect.objectContaining({
        id: 'conversation-1',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'conversation-participant-index:identity-1',
      expect.objectContaining({
        conversations: expect.arrayContaining([
          expect.objectContaining({ id: 'conversation-1' }),
        ]),
        participantId: 'identity-1',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'conversation-message-index:conversation-1',
      expect.objectContaining({
        conversationId: 'conversation-1',
        messages: expect.arrayContaining([
          expect.objectContaining({ id: 'message-1' }),
        ]),
      }),
    );
  });

  it('projects community events into replicated read model stores', async () => {
    const stores = fakeStores();

    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        CommunityWasCreatedEvent.EVENT_NAME,
        {
          community: {
            id: 'community-1',
            memberIds: ['identity-1'],
            name: 'community',
            networkId: 'network-1',
          },
          communityId: 'community-1',
        },
        'community-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        CommunityChannelMessageWasSentEvent.EVENT_NAME,
        {
          channelId: 'channel-1',
          communityId: 'community-1',
          message: {
            channelId: 'channel-1',
            communityId: 'community-1',
            encryptedPayload: 'payload',
            id: 'community-message-1',
            type: 'sent',
          },
          messageId: 'community-message-1',
        },
        'community-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        CommunityChannelMessageReactionWasAddedEvent.EVENT_NAME,
        {
          authorIdentityId: 'identity-1',
          channelId: 'channel-1',
          communityId: 'community-1',
          emoji: ':fire:',
          messageId: 'community-message-1',
        },
        'community-1',
      ),
    );

    expect(stores.communities.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'community-1',
        lastEventType: CommunityWasCreatedEvent.EVENT_NAME,
      }),
    );
    expect(stores.messages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 'community-1',
        id: 'community-message-1',
        scopeType: 'community_channel',
      }),
    );
    expect(stores.reactions.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'community_channel:community-1:channel-1:community-message-1:identity-1::fire:',
        removed: false,
        scopeType: 'community_channel',
      }),
    );
  });

  it('projects smaller replicated events into their dedicated stores', async () => {
    const stores = fakeStores();

    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ConversationMessagesWereReadEvent.EVENT_NAME,
        {
          messageId: 'message-1',
          networkId: 'network-1',
          readerIdentityId: 'identity-1',
        },
        'conversation-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        NotificationWasCreatedEvent.EVENT_NAME,
        {
          notification: {
            createdAt: 1780000000000,
            id: 'notification-1',
            payload: {
              conversationId: 'conversation-1',
              encryptedConversationKey: 'encrypted-key',
              inviterIdentityId: 'identity-2',
              inviterSignature: 'signature',
              recipientIdentityId: 'identity-1',
            },
            recipientIdentityId: 'identity-1',
            state: 'pending',
            status: 'unread',
            type: 'conversation_invitation',
          },
          recipientIdentityId: 'identity-1',
          type: 'conversation_invitation',
        },
        'notification-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        NotificationWasAcceptedEvent.EVENT_NAME,
        {
          notification: {
            createdAt: 1780000000000,
            id: 'notification-1',
            payload: {
              conversationId: 'conversation-1',
              encryptedConversationKey: 'encrypted-key',
              inviterIdentityId: 'identity-2',
              inviterSignature: 'signature',
              recipientIdentityId: 'identity-1',
            },
            recipientIdentityId: 'identity-1',
            state: 'accepted',
            status: 'read',
            type: 'conversation_invitation',
          },
          recipientIdentityId: 'identity-1',
        },
        'notification-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        CommunityMembershipRequestWasCreatedEvent.EVENT_NAME,
        {
          request: {
            communityId: 'community-1',
            id: 'request-1',
            status: 'pending',
          },
        },
        'community-1',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        CommunityInviteWasCreatedEvent.EVENT_NAME,
        {
          invite: {
            communityId: 'community-1',
            createdAt: 1780000000000,
            creatorIdentityId: 'identity-1',
            maxUses: 3,
            token: 'invite-token',
            uses: 0,
          },
          networkId: 'network-1',
        },
        'invite-token',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        CommunityInviteWasAcceptedEvent.EVENT_NAME,
        {
          invite: {
            communityId: 'community-1',
            createdAt: 1780000000000,
            creatorIdentityId: 'identity-1',
            maxUses: 3,
            token: 'invite-token',
            uses: 1,
          },
          networkId: 'network-1',
        },
        'invite-token',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ContentReplicationWasRegisteredEvent.EVENT_NAME,
        {
          cid: 'bafy',
          networkIds: ['network-1'],
          sizeBytes: 128,
        },
        'bafy',
      ),
    );
    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ContentReplicationWasClaimedEvent.EVENT_NAME,
        {
          cid: 'bafy',
          claimedAt: 1780000000001,
          networkId: 'network-1',
          nodeId: 'node-1',
        },
        'bafy',
      ),
    );

    expect(stores.heads.put).toHaveBeenCalledWith(
      'read-marker:conversation-1:identity-1',
      expect.objectContaining({
        messageId: 'message-1',
        networkId: 'network-1',
      }),
    );
    expect(stores.notifications.put).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: 1780000000000,
        id: 'notification-1',
        payload: expect.objectContaining({
          conversationId: 'conversation-1',
        }),
        recipientIdentityId: 'identity-1',
        status: 'unread',
      }),
    );
    expect(stores.notifications.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notification-1',
        state: 'accepted',
        status: 'read',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'notification:notification-1',
      expect.objectContaining({
        id: 'notification-1',
        state: 'accepted',
        status: 'read',
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'notification-recipient-index:identity-1',
      expect.objectContaining({
        notifications: expect.arrayContaining([
          expect.objectContaining({ id: 'notification-1' }),
        ]),
        recipientIdentityId: 'identity-1',
      }),
    );
    expect(stores.requests.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'request-1',
        kind: 'community_membership_request',
        status: 'pending',
      }),
    );
    expect(stores.requests.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'invite-token',
        kind: 'community_invite',
        token: 'invite-token',
        uses: 0,
      }),
    );
    expect(stores.requests.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'invite-token',
        kind: 'community_invite',
        token: 'invite-token',
        uses: 1,
      }),
    );
    expect(stores.contentReplication.put).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafy',
        id: 'bafy',
        sizeBytes: 128,
      }),
    );
    expect(stores.heads.put).toHaveBeenCalledWith(
      'content-replication:bafy',
      expect.objectContaining({
        cid: 'bafy',
        id: 'bafy',
      }),
    );
    expect(stores.contentReplication.put).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafy',
        id: 'bafy:network-1:node-1',
        kind: 'content_replica_claim',
        nodeId: 'node-1',
      }),
    );
  });

  it('projects conversation message deletions with target tombstones', async () => {
    const stores = fakeStores();

    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ConversationMessageWasDeletedEvent.EVENT_NAME,
        {
          message: {
            authorId: 'identity-1',
            conversationId: 'conversation-1',
            createdAt: 1780000000001,
            id: 'delete-message-1',
            previousMessageIds: ['message-1'],
            signature: 'signature',
            targetMessageId: 'message-1',
            type: 'deleted',
          },
          messageId: 'delete-message-1',
          targetMessageId: 'message-1',
        },
        'conversation-1',
      ),
    );

    expect(stores.messages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'delete-message-1',
        scopeType: 'conversation',
        targetMessageId: 'message-1',
      }),
    );
    expect(stores.messages.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'message-1',
        scopeType: 'conversation',
        valid: false,
      }),
    );
  });
});
