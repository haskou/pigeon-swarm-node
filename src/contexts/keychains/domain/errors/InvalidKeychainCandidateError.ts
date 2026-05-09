import { DomainError } from '@haskou/value-objects';

export class InvalidKeychainCandidateError extends DomainError {
  constructor() {
    super('Keychain candidate is not valid.');
  }
}
