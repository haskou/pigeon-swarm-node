import { DomainError } from '@haskou/value-objects';

export class InvalidPollScopeError extends DomainError {
  constructor() {
    super('Poll scope is not valid');
  }
}
