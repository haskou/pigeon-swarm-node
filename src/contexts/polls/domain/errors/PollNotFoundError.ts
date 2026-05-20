import { DomainError } from '@haskou/value-objects';

export class PollNotFoundError extends DomainError {
  constructor() {
    super('Poll not found');
  }
}
