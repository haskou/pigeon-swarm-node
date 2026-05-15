import { DomainError } from '@haskou/value-objects';

export class CallNotFoundError extends DomainError {
  constructor() {
    super('Call not found.');
  }
}
