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
import { CommunityWasCreatedEvent } from '@app/contexts/communities/domain/events/CommunityWasCreatedEvent';
import { CommunityWasUpdatedEvent } from '@app/contexts/communities/domain/events/CommunityWasUpdatedEvent';
import { ContentReplicationWasClaimedEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasClaimedEvent';
import { ContentReplicationWasRegisteredEvent } from '@app/contexts/content-replication/domain/events/ContentReplicationWasRegisteredEvent';
import { ConversationMessageReactionWasAddedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasAddedEvent';
import { ConversationMessageReactionWasRemovedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageReactionWasRemovedEvent';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import { ConversationMessageWasDeletedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasDeletedEvent';
import { ConversationMessageWasEditedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasEditedEvent';
import { ConversationMessageWasSentEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasSentEvent';
import { ConversationWasCreatedEvent } from '@app/contexts/conversations/domain/events/ConversationWasCreatedEvent';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import { KeychainWasPublishedEvent } from '@app/contexts/keychains/domain/events/KeychainWasPublishedEvent';
import { NotificationWasAcceptedEvent } from '@app/contexts/notifications/domain/events/NotificationWasAcceptedEvent';
import { NotificationWasCreatedEvent } from '@app/contexts/notifications/domain/events/NotificationWasCreatedEvent';
import { NotificationWasDeclinedEvent } from '@app/contexts/notifications/domain/events/NotificationWasDeclinedEvent';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

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
    bindingKey: ConversationWasCreatedEvent.EVENT_NAME,
    domainEvent: ConversationWasCreatedEvent,
  },
  {
    bindingKey: IdentityWasCreatedEvent.EVENT_NAME,
    domainEvent: IdentityWasCreatedEvent,
  },
  {
    bindingKey: IdentityWasUpdatedEvent.EVENT_NAME,
    domainEvent: IdentityWasUpdatedEvent,
  },
  {
    bindingKey: ContentReplicationWasClaimedEvent.EVENT_NAME,
    domainEvent: ContentReplicationWasClaimedEvent,
  },
  {
    bindingKey: ContentReplicationWasRegisteredEvent.EVENT_NAME,
    domainEvent: ContentReplicationWasRegisteredEvent,
  },
  {
    bindingKey: KeychainWasPublishedEvent.EVENT_NAME,
    domainEvent: KeychainWasPublishedEvent,
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
