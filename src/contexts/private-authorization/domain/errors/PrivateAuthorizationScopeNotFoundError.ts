import { DomainError } from '@haskou/value-objects';

export class PrivateAuthorizationScopeNotFoundError extends DomainError {
  public constructor() {
    super('Private authorization scope not found');
  }
}
