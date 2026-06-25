import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CallMissedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.call.missed';

  public eventName(): string {
    return CallMissedEvent.EVENT_NAME;
  }
}
