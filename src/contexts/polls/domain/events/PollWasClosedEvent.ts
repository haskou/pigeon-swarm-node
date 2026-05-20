import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class PollWasClosedEvent extends DomainEvent {
  public static EVENT_NAME = 'polls.v1.poll.was_closed';

  public eventName(): string {
    return PollWasClosedEvent.EVENT_NAME;
  }
}
