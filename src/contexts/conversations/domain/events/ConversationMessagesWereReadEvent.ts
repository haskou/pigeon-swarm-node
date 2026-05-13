import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class ConversationMessagesWereReadEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.messages.were_read';

  public eventName(): string {
    return ConversationMessagesWereReadEvent.EVENT_NAME;
  }
}
