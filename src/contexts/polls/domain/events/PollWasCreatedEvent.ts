import { DomainEvent } from '@haskou/ddd-kernel/domain';

export class PollWasCreatedEvent extends DomainEvent {
  public static EVENT_NAME = 'polls.v1.poll.was_created';

  public eventName(): string {
    return PollWasCreatedEvent.EVENT_NAME;
  }
}
