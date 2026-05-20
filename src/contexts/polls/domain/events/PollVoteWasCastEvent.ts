import DomainEvent from '@app/shared/domain/events/DomainEvent';

export class PollVoteWasCastEvent extends DomainEvent {
  public static EVENT_NAME = 'polls.v1.vote.was_cast';

  public eventName(): string {
    return PollVoteWasCastEvent.EVENT_NAME;
  }
}
