import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallParticipantMissedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.missed';

  public eventName(): string {
    return CallParticipantMissedEvent.EVENT_NAME;
  }
}
