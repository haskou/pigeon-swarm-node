import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationSyncAvailableEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.conversation.sync_available';

  public eventName(): string {
    return ConversationSyncAvailableEvent.EVENT_NAME;
  }
}
