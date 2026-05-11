import { DomainError } from '@haskou/value-objects';

export class InvalidIdentityCandidateError extends DomainError {
  constructor() {
    super('Invalid identity candidate.');
  }
}
