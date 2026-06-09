import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunityMembershipRequestWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasCreatedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import { IPFSContentReplicationWasRegisteredEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasRegisteredEvent';
import { NotificationWasAcceptedEvent } from '@app/contexts/notifications/domain/events/NotificationWasAcceptedEvent';
import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';
import { OrbitDBDomainEventProjector } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDomainEventProjector';
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
    ipfsReplication: fakeStore(),
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

  it('projects conversation sync batches into replicated read model stores', async () => {
    const stores = fakeStores();

    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        ConversationSyncAvailableEvent.EVENT_NAME,
        {
          conversation: {
            id: 'conversation-1',
            name: 'group',
            networkId: 'network-1',
            participantIds: ['identity-1', 'identity-2'],
            type: 'group',
          },
          messageCandidates: [
            {
              message: {
                conversationId: 'conversation-1',
                encryptedPayload: 'payload',
                id: 'message-1',
                type: 'sent',
              },
              messageId: 'message-1',
            },
          ],
          reactionCandidates: [
            {
              authorId: 'identity-1',
              conversationId: 'conversation-1',
              createdAt: 1780000000000,
              emoji: ':thumbsup:',
              messageId: 'message-1',
            },
          ],
        },
        'conversation-1',
      ),
    );

    expect(stores.conversations.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conversation-1',
        lastEventType: ConversationSyncAvailableEvent.EVENT_NAME,
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
      `event:${ConversationSyncAvailableEvent.EVENT_NAME}:conversation-1`,
      expect.objectContaining({
        eventId: `${ConversationSyncAvailableEvent.EVENT_NAME}:event-id`,
      }),
    );
  });

  it('projects community sync batches into replicated read model stores', async () => {
    const stores = fakeStores();

    await projector.project(
      storesFrom(stores),
      replicatedMessage(
        CommunitySyncAvailableEvent.EVENT_NAME,
        {
          community: {
            id: 'community-1',
            memberIds: ['identity-1'],
            name: 'community',
            networkId: 'network-1',
          },
          communityId: 'community-1',
          messageCandidates: [
            {
              channelId: 'channel-1',
              communityId: 'community-1',
              encryptedPayload: 'payload',
              id: 'community-message-1',
              type: 'sent',
            },
          ],
          reactionCandidates: [
            {
              authorIdentityId: 'identity-1',
              channelId: 'channel-1',
              communityId: 'community-1',
              emoji: ':fire:',
              messageId: 'community-message-1',
            },
          ],
        },
        'community-1',
      ),
    );

    expect(stores.communities.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'community-1',
        lastEventType: CommunitySyncAvailableEvent.EVENT_NAME,
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
        IPFSContentReplicationWasRegisteredEvent.EVENT_NAME,
        {
          cid: 'bafy',
          networkIds: ['network-1'],
          sizeBytes: 128,
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
    expect(stores.requests.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'request-1',
        status: 'pending',
      }),
    );
    expect(stores.ipfsReplication.put).toHaveBeenCalledWith(
      expect.objectContaining({
        cid: 'bafy',
        id: 'bafy',
        sizeBytes: 128,
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
