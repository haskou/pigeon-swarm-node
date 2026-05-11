import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationSyncRequestedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.conversation.sync_requested';

  public eventName(): string {
    return ConversationSyncRequestedEvent.EVENT_NAME;
  }
}
