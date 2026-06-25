import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class NotificationWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'notifications.v1.notification.was_created';

  public eventName(): string {
    return NotificationWasCreatedEvent.EVENT_NAME;
  }
}
