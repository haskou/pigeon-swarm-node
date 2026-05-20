import { DomainError } from '@haskou/value-objects';

export class PollAlreadyClosedError extends DomainError {
  constructor() {
    super('Poll is already closed');
  }
}
