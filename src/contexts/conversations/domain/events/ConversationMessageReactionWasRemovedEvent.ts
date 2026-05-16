import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationMessageReactionWasRemovedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.reaction.was_removed';

  public eventName(): string {
    return ConversationMessageReactionWasRemovedEvent.EVENT_NAME;
  }
}
