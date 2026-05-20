import { DomainError } from '@haskou/value-objects';

export class PollOptionNotFoundError extends DomainError {
  constructor() {
    super('Poll option not found');
  }
}
