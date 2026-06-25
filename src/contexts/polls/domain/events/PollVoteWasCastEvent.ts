import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class PollVoteWasCastEvent extends DomainEvent {
  public static EVENT_NAME = 'polls.v1.vote.was_cast';

  public eventName(): string {
    return PollVoteWasCastEvent.EVENT_NAME;
  }
}
