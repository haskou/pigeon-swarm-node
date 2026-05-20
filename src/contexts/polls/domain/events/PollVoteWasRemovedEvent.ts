import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class PollVoteWasRemovedEvent extends DomainEvent {
  public static EVENT_NAME = 'polls.v1.vote.was_removed';

  public eventName(): string {
    return PollVoteWasRemovedEvent.EVENT_NAME;
  }
}
