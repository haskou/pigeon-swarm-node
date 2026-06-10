import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
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
      message.recipients,
    );

    await this.repository.save(poll);
    await this.eventPublisher.publish(poll.pullDomainEvents());

    return poll;
  }
}
