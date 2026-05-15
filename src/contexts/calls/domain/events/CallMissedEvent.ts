import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallMissedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.call.missed';

  public eventName(): string {
    return CallMissedEvent.EVENT_NAME;
  }
}
