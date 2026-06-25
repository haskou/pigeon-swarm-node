import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class ConversationMessageReactionWasAddedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.reaction.was_added';

  public eventName(): string {
    return ConversationMessageReactionWasAddedEvent.EVENT_NAME;
  }
}
