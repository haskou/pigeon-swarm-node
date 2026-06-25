import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class NotificationWasAcceptedEvent extends DomainEvent {
  public static EVENT_NAME = 'notifications.v1.notification.was_accepted';

  public eventName(): string {
    return NotificationWasAcceptedEvent.EVENT_NAME;
  }
}
