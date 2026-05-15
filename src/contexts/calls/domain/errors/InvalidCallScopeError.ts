import { DomainError } from '@haskou/value-objects';

export class InvalidCallScopeError extends DomainError {
  constructor() {
    super('Call scope is not valid.');
  }
}
