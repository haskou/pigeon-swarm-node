import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallEndedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.call.ended';

  public eventName(): string {
    return CallEndedEvent.EVENT_NAME;
  }
}
