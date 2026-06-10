import { DomainError } from '@haskou/value-objects';

export class InvalidEncryptedMasterKeyError extends DomainError {
  constructor() {
    super('Encrypted master key must be a non-empty encrypted payload.');
  }
}
