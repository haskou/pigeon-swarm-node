import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CallStartedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.call.started';

  public eventName(): string {
    return CallStartedEvent.EVENT_NAME;
  }
}
