import { DomainError } from '@haskou/value-objects';

export class IdentityPresenceNotFoundError extends DomainError {
  constructor() {
    super('Identity presence not found.');
  }
}
