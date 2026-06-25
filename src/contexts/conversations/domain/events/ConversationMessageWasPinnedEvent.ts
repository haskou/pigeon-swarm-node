import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class ConversationMessageWasPinnedEvent extends DomainEvent {
  public static EVENT_NAME = 'conversations.v1.message.was_pinned';

  public eventName(): string {
    return ConversationMessageWasPinnedEvent.EVENT_NAME;
  }
}
