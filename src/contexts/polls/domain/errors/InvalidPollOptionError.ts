import { DomainError } from '@haskou/value-objects';

export class InvalidPollOptionError extends DomainError {
  constructor() {
    super('Poll options are not valid');
  }
}
