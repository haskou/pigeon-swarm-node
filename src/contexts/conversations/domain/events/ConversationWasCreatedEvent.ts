import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.conversation.was_created';

  public eventName(): string {
    return ConversationWasCreatedEvent.EVENT_NAME;
  }
}
