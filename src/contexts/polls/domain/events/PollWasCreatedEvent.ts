import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class PollWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'polls.v1.poll.was_created';

  public eventName(): string {
    return PollWasCreatedEvent.EVENT_NAME;
  }
}
