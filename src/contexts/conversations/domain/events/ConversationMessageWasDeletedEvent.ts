import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class ConversationMessageWasDeletedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.was_deleted';

  public eventName(): string {
    return ConversationMessageWasDeletedEvent.EVENT_NAME;
  }
}
