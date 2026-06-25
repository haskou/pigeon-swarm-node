import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class ConversationMessageReactionWasRemovedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.reaction.was_removed';

  public eventName(): string {
    return ConversationMessageReactionWasRemovedEvent.EVENT_NAME;
  }
}
