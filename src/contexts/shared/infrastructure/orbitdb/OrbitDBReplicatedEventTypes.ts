import { CommunityChannelMessageReactionWasAddedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasAddedEvent';
import { CommunityChannelMessageReactionRemovedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageReactionWasRemovedEvent';
import { CommunityChannelMessageWasDeletedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasDeletedEvent';
import { CommunityChannelMessageWasEditedEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasEditedEvent';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import { CommunityInviteWasAcceptedEvent } from '@app/contexts/communities/domain/events/CommunityInviteWasAcceptedEvent';
import { CommunityInviteWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityInviteWasCreatedEvent';
import { CommunityMembershipRequestWasAcceptedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasAcceptedEvent';
import { CommunityMembershipRequestWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasCreatedEvent';
import { CommunityMembershipRequestWasDeclinedEvent } from '@app/contexts/communities/domain/events/CommunityMembershipRequestWasDeclinedEvent';
import { CommunitySyncAvailableEvent } from '@app/contexts/communities/domain/events/CommunitySyncAvailableEvent';
import { CommunityWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityWasCreatedEvent';
import { CommunityWasUpdatedEvent } from '@app/contexts/communities/domain/events/CommunityWasUpdatedEvent';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import { ConversationMessageReactionWasRemovedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasRemovedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationSyncAvailableEvent } from '@app/contexts/conversations/domain/events/ConversationSyncAvailableEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { IdentitySyncAvailableEvent } from '@app/contexts/identities/domain/events/IdentitySyncAvailableEvent';
import { IPFSContentReplicationWasClaimedEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasClaimedEvent';
import { IPFSContentReplicationWasRegisteredEvent } from '@app/contexts/ipfs-replication/domain/events/IPFSContentReplicationWasRegisteredEvent';
import { KeychainSyncAvailableEvent } from '@app/contexts/keychains/domain/events/KeychainSyncAvailableEvent';
import { NotificationWasAcceptedEvent } from '@app/contexts/notifications/domain/events/NotificationWasAcceptedEvent';
import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';
import { NotificationWasDeclinedEvent } from '@app/contexts/notifications/domain/events/NotificationWasDeclinedEvent';
import DomainEvent from '@app/shared/domain/events/DomainEvent';

export type OrbitDBReplicatedEventType = {
  bindingKey: string;
  domainEvent: typeof DomainEvent;
};

export const orbitDBReplicatedEventTypes: OrbitDBReplicatedEventType[] = [
  {
    bindingKey: CommunityChannelMessageReactionWasAddedEvent.EVENT_NAME,
    domainEvent: CommunityChannelMessageReactionWasAddedEvent,
  },
  {
    bindingKey: CommunityChannelMessageReactionRemovedEvent.EVENT_NAME,
    domainEvent: CommunityChannelMessageReactionRemovedEvent,
  },
  {
    bindingKey: CommunityChannelMessageWasDeletedEvent.EVENT_NAME,
    domainEvent: CommunityChannelMessageWasDeletedEvent,
  },
  {
    bindingKey: CommunityChannelMessageWasEditedEvent.EVENT_NAME,
    domainEvent: CommunityChannelMessageWasEditedEvent,
  },
  {
    bindingKey: CommunityChannelMessageWasSentEvent.EVENT_NAME,
    domainEvent: CommunityChannelMessageWasSentEvent,
  },
  {
    bindingKey: CommunityInviteWasAcceptedEvent.EVENT_NAME,
    domainEvent: CommunityInviteWasAcceptedEvent,
  },
  {
    bindingKey: CommunityInviteWasCreatedEvent.EVENT_NAME,
    domainEvent: CommunityInviteWasCreatedEvent,
  },
  {
    bindingKey: CommunityMembershipRequestWasAcceptedEvent.EVENT_NAME,
    domainEvent: CommunityMembershipRequestWasAcceptedEvent,
  },
  {
    bindingKey: CommunityMembershipRequestWasCreatedEvent.EVENT_NAME,
    domainEvent: CommunityMembershipRequestWasCreatedEvent,
  },
  {
    bindingKey: CommunityMembershipRequestWasDeclinedEvent.EVENT_NAME,
    domainEvent: CommunityMembershipRequestWasDeclinedEvent,
  },
  {
    bindingKey: CommunitySyncAvailableEvent.EVENT_NAME,
    domainEvent: CommunitySyncAvailableEvent,
  },
  {
    bindingKey: CommunityWasCreatedEvent.EVENT_NAME,
    domainEvent: CommunityWasCreatedEvent,
  },
  {
    bindingKey: CommunityWasUpdatedEvent.EVENT_NAME,
    domainEvent: CommunityWasUpdatedEvent,
  },
  {
    bindingKey: ConversationMessageReactionWasAddedEvent.EVENT_NAME,
    domainEvent: ConversationMessageReactionWasAddedEvent,
  },
  {
    bindingKey: ConversationMessageReactionWasRemovedEvent.EVENT_NAME,
    domainEvent: ConversationMessageReactionWasRemovedEvent,
  },
  {
    bindingKey: ConversationMessagesWereReadEvent.EVENT_NAME,
    domainEvent: ConversationMessagesWereReadEvent,
  },
  {
    bindingKey: ConversationMessageWasDeletedEvent.EVENT_NAME,
    domainEvent: ConversationMessageWasDeletedEvent,
  },
  {
    bindingKey: ConversationMessageWasEditedEvent.EVENT_NAME,
    domainEvent: ConversationMessageWasEditedEvent,
  },
  {
    bindingKey: ConversationMessageWasSentEvent.EVENT_NAME,
    domainEvent: ConversationMessageWasSentEvent,
  },
  {
    bindingKey: ConversationSyncAvailableEvent.EVENT_NAME,
    domainEvent: ConversationSyncAvailableEvent,
  },
  {
    bindingKey: ConversationWasCreatedEvent.EVENT_NAME,
    domainEvent: ConversationWasCreatedEvent,
  },
  {
    bindingKey: IdentitySyncAvailableEvent.EVENT_NAME,
    domainEvent: IdentitySyncAvailableEvent,
  },
  {
    bindingKey: IPFSContentReplicationWasClaimedEvent.EVENT_NAME,
    domainEvent: IPFSContentReplicationWasClaimedEvent,
  },
  {
    bindingKey: IPFSContentReplicationWasRegisteredEvent.EVENT_NAME,
    domainEvent: IPFSContentReplicationWasRegisteredEvent,
  },
  {
    bindingKey: KeychainSyncAvailableEvent.EVENT_NAME,
    domainEvent: KeychainSyncAvailableEvent,
  },
  {
    bindingKey: NotificationWasAcceptedEvent.EVENT_NAME,
    domainEvent: NotificationWasAcceptedEvent,
  },
  {
    bindingKey: NotificationWasCreatedEvent.EVENT_NAME,
    domainEvent: NotificationWasCreatedEvent,
  },
  {
    bindingKey: NotificationWasDeclinedEvent.EVENT_NAME,
    domainEvent: NotificationWasDeclinedEvent,
  },
];
