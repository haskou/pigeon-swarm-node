import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class CallParticipantLeftEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.left';

  public eventName(): string {
    return CallParticipantLeftEvent.EVENT_NAME;
  }
}
