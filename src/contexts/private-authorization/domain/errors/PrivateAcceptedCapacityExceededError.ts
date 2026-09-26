import { DomainError } from '@haskou/value-objects';

export class PrivateAcceptedCapacityExceededError extends DomainError {
  public constructor() {
    super('Private accepted operation capacity exceeded');
  }
}
