import { DomainError } from '@haskou/value-objects';

export class KeychainOwnerNetworksNotFoundError extends DomainError {
  constructor() {
    super('Keychain owner identity networks were not found.');
  }
}
