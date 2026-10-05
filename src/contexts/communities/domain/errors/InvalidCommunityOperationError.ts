import { DomainError } from '@haskou/value-objects';

export class InvalidCommunityOperationError extends DomainError {
  constructor() {
    super('Invalid community operation');
  }
}
