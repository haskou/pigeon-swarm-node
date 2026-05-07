import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationMessageWasEditedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.was_edited';

  public eventName(): string {
    return ConversationMessageWasEditedEvent.EVENT_NAME;
  }
}
