import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { PollNotFoundError } from '../../domain/errors/PollNotFoundError';
import { PollWasClosedEvent } from '../../domain/events/PollWasClosedEvent';
import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollCloseMessage } from './messages/PollCloseMessage';

export class PollCloser {
  constructor(
    private readonly repository: PollRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async close(message: PollCloseMessage): Promise<Poll> {
    const poll = await this.repository.findById(message.pollId);

    if (!poll) {
      throw new PollNotFoundError();
    }

    poll.close();
    await this.repository.save(poll);
    const eventStreamId = poll.getScope().match({
      communityChannel: (communityId) => communityId.valueOf(),
      groupConversation: (conversationId) => conversationId.valueOf(),
    });

    await this.eventPublisher.publish([
      new PollWasClosedEvent(eventStreamId, {
        ...message.audience.toPrimitives(),
        actorIdentityId: message.actorIdentityId.valueOf(),
        poll: poll.toPrimitives(),
        pollId: poll.getId().valueOf(),
      }),
    ]);

    return poll;
  }
}
