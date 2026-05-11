import { DomainError } from '@haskou/value-objects';

export class IdentityUpdateRequesterMismatchError extends DomainError {
  constructor() {
    super('Only the identity owner can publish identity updates.');
  }
}
