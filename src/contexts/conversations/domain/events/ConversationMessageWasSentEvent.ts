import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class ConversationMessageWasSentEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.was_sent';

  public eventName(): string {
    return ConversationMessageWasSentEvent.EVENT_NAME;
  }
}
