import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class NotificationWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'notifications.v1.notification.was_created';

  public eventName(): string {
    return NotificationWasCreatedEvent.EVENT_NAME;
  }
}
