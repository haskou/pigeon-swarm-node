import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CallParticipantDeclinedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.declined';

  public eventName(): string {
    return CallParticipantDeclinedEvent.EVENT_NAME;
  }
}
