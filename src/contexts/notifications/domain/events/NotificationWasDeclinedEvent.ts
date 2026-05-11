import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class NotificationWasDeclinedEvent extends DomainEvent {
  public static EVENT_NAME = 'notifications.v1.notification.was_declined';

  public eventName(): string {
    return NotificationWasDeclinedEvent.EVENT_NAME;
  }
}
