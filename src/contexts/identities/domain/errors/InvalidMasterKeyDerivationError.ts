import { DomainError } from '@haskou/value-objects';

export class InvalidMasterKeyDerivationError extends DomainError {
  constructor() {
    super('Master key derivation must be a non-empty JSON object.');
  }
}
