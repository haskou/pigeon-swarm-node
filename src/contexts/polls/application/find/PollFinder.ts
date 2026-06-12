import { PollNotFoundError } from '../../domain/errors/PollNotFoundError';
import { Poll } from '../../domain/Poll';
import PollRepository from '../../domain/repositories/PollRepository';
import { PollFindMessage } from './messages/PollFindMessage';

export default class PollFinder {
  constructor(private readonly repository: PollRepository) {}

  public async find(message: PollFindMessage): Promise<Poll> {
    const poll = await this.repository.findById(message.pollId);

    if (!poll) {
      throw new PollNotFoundError();
    }

    return poll;
  }
}
