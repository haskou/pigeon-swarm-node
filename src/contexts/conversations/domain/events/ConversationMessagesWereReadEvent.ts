import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class ConversationMessagesWereReadEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.messages.were_read';

  public eventName(): string {
    return ConversationMessagesWereReadEvent.EVENT_NAME;
  }
}
