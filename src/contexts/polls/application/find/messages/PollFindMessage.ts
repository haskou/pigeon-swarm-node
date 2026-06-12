import { PollId } from '../../../domain/value-objects/PollId';

export class PollFindMessage {
  public readonly pollId: PollId;

  constructor(pollId: string) {
    this.pollId = new PollId(pollId);
  }
}
