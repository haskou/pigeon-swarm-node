import { DomainError } from '@haskou/value-objects';

export class InvalidIdentityAuthorizationRevisionError extends DomainError {
  public constructor() {
    super('Identity authorization revision must be a non-negative integer.');
  }
}
