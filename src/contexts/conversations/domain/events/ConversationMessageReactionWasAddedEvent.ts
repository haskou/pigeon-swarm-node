import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationMessageReactionWasAddedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.reaction.was_added';

  public eventName(): string {
    return ConversationMessageReactionWasAddedEvent.EVENT_NAME;
  }
}
