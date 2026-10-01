import { DomainError } from '@haskou/value-objects';

export class InvalidPublicMutationError extends DomainError {
  public constructor() {
    super('Invalid public mutation');
  }
}
