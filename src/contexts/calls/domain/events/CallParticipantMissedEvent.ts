import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CallParticipantMissedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.missed';

  public eventName(): string {
    return CallParticipantMissedEvent.EVENT_NAME;
  }
}
