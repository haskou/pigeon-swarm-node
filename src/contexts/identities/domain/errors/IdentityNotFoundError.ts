import { DomainError } from '@haskou/value-objects';

export class IdentityNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Identity with id ${id} not found`);
  }
}
