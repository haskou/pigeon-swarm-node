import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallSignalSentEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.signal.sent';

  public eventName(): string {
    return CallSignalSentEvent.EVENT_NAME;
  }
}
