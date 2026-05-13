import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class CallParticipantDeclinedEvent extends DomainEvent {
  public static EVENT_NAME = 'calls.v1.participant.declined';

  public eventName(): string {
    return CallParticipantDeclinedEvent.EVENT_NAME;
  }
}
