import { DomainError } from '@haskou/value-objects';

export class PollMultipleVotesNotAllowedError extends DomainError {
  constructor() {
    super('Poll does not allow multiple votes');
  }
}
