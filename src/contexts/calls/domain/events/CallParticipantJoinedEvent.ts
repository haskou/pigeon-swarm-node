import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CallParticipantJoinedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.joined';

  public eventName(): string {
    return CallParticipantJoinedEvent.EVENT_NAME;
  }
}
