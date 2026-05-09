import { DomainError } from '@haskou/value-objects';

export class InvalidKeychainVersionError extends DomainError {
  constructor() {
    super('Keychain version must be a positive integer.');
  }
}
