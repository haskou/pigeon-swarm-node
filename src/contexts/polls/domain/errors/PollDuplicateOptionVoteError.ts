import { DomainError } from '@haskou/value-objects';

export class PollDuplicateOptionVoteError extends DomainError {
  constructor() {
    super('Poll vote option ids must be unique');
  }
}
