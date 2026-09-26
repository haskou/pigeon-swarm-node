import { DomainError } from '@haskou/value-objects';

export class PrivatePendingCapacityExceededError extends DomainError {
  public constructor() {
    super('Private pending capacity exceeded');
  }
}
