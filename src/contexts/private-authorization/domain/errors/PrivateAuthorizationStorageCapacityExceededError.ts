import { DomainError } from '@haskou/value-objects';

export class PrivateAuthorizationStorageCapacityExceededError extends DomainError {
  public constructor() {
    super('Private authorization storage capacity exceeded');
  }
}
