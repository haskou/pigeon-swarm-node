import { DomainError } from '@haskou/value-objects';

export class InvalidCallSignalError extends DomainError {
  constructor() {
    super('Call signal is not valid.');
  }
}
