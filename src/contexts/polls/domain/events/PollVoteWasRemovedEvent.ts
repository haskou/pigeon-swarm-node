import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class PollVoteWasRemovedEvent extends DomainEvent {
  public static EVENT_NAME = 'polls.v1.vote.was_removed';

  public eventName(): string {
    return PollVoteWasRemovedEvent.EVENT_NAME;
  }
}
