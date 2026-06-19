import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { PollNotFoundError } from '../../domain/errors/PollNotFoundError';
import { PollVoteWasCastEvent } from '../../domain/events/PollVoteWasCastEvent';
import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollVoteCastMessage } from './messages/PollVoteCastMessage';

export class PollVoteCaster {
  constructor(
    private readonly repository: PollRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async cast(message: PollVoteCastMessage): Promise<Poll> {
    const poll = await this.repository.findById(message.pollId);

    if (!poll) {
      throw new PollNotFoundError();
    }

    poll.castVote(message.voterIdentityId, message.optionIds);
    await this.repository.save(poll);
    await this.eventPublisher.publish([
      new PollVoteWasCastEvent(poll.getScope().aggregateId(), {
        ...message.audience.toPrimitives(),
        optionIds: message.optionIds.map((optionId) => optionId.valueOf()),
        poll: poll.toPrimitives(),
        pollId: poll.getId().valueOf(),
        voterIdentityId: message.voterIdentityId.valueOf(),
      }),
    ]);

    return poll;
  }
}
