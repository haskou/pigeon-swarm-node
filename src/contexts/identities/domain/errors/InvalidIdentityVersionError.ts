import { DomainError } from '@haskou/value-objects';

export class InvalidIdentityVersionError extends DomainError {
  constructor() {
    super('Identity version must be a positive integer.');
  }
}
