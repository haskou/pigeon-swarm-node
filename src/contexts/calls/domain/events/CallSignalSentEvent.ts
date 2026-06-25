import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CallSignalSentEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.signal.sent';

  public eventName(): string {
    return CallSignalSentEvent.EVENT_NAME;
  }
}
