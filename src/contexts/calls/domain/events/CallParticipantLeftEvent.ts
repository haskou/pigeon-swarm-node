import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallParticipantLeftEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.left';

  public eventName(): string {
    return CallParticipantLeftEvent.EVENT_NAME;
  }
}
