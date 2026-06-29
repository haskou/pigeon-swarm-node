import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { PollNotFoundError } from '../../domain/errors/PollNotFoundError';
import { PollVoteWasRemovedEvent } from '../../domain/events/PollVoteWasRemovedEvent';
import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollVoteRemoveMessage } from './messages/PollVoteRemoveMessage';

export class PollVoteRemover {
  constructor(
    private readonly repository: PollRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async remove(message: PollVoteRemoveMessage): Promise<Poll> {
    const poll = await this.repository.findById(message.pollId);

    if (!poll) {
      throw new PollNotFoundError();
    }

    poll.removeVote(message.voterIdentityId);
    await this.repository.save(poll);
    await this.eventPublisher.publish([
      new PollVoteWasRemovedEvent(poll.getScope().selectEventStreamId(), {
        ...message.audience.toPrimitives(),
        poll: poll.toPrimitives(),
        pollId: poll.getId().valueOf(),
        voterIdentityId: message.voterIdentityId.valueOf(),
      }),
    ]);

    return poll;
  }
}
