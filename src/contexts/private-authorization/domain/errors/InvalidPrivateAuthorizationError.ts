import { DomainError } from '@haskou/value-objects';

export class InvalidPrivateAuthorizationError extends DomainError {
  public constructor() {
    super('Invalid private authorization');
  }
}
