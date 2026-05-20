import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { PollWasCreatedEvent } from '../../domain/events/PollWasCreatedEvent';
import { Poll } from '../../domain/Poll';
import { PollRepository } from '../../domain/repositories/PollRepository';
import { PollCreateMessage } from './messages/PollCreateMessage';

export class PollCreator {
  constructor(
    private readonly repository: PollRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async create(message: PollCreateMessage): Promise<Poll> {
    const poll = Poll.create(
      message.creatorIdentityId,
      message.scope,
      message.question,
      message.options,
      message.allowsMultipleVotes,
      message.expiresAt,
    );

    await this.repository.save(poll);
    await this.eventPublisher.publish([
      new PollWasCreatedEvent(message.scope.aggregateId(), {
        ...message.recipients,
        poll: poll.toPrimitives(),
        pollId: poll.getId().valueOf(),
      }),
    ]);

    return poll;
  }
}
