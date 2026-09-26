import { DomainError } from '@haskou/value-objects';

export class PrivateAuthorizationConflictError extends DomainError {
  public constructor() {
    super('Private authorization conflict');
  }
}
