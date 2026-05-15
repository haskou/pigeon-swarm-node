import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallParticipantJoinedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.joined';

  public eventName(): string {
    return CallParticipantJoinedEvent.EVENT_NAME;
  }
}
