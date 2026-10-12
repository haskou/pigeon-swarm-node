import { DomainError } from '@haskou/value-objects';

import { KeychainExternalIdentifier } from '../value-objects/KeychainExternalIdentifier';

export class KeychainExternalIdentifierNotFoundError extends DomainError {
  constructor(externalIdentifier: KeychainExternalIdentifier) {
    super(`Keychain ${externalIdentifier.valueOf()} not found`);
  }
}
