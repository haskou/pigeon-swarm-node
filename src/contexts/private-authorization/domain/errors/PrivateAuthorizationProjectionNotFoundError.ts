import { DomainError } from '@haskou/value-objects';

export class PrivateAuthorizationProjectionNotFoundError extends DomainError {
  public constructor() {
    super('Private authorization projection not found');
  }
}
