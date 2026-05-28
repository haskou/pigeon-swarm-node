import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationMessageWasUnpinnedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.was_unpinned';

  public eventName(): string {
    return ConversationMessageWasUnpinnedEvent.EVENT_NAME;
  }
}
