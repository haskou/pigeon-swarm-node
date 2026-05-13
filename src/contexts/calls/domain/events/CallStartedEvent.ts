import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallStartedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.call.started';

  public eventName(): string {
    return CallStartedEvent.EVENT_NAME;
  }
}
