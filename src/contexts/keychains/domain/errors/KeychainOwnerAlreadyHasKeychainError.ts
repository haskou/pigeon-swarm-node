import { DomainError } from '@haskou/value-objects';

export class KeychainOwnerAlreadyHasKeychainError extends DomainError {
  constructor() {
    super(
      'Owner identity already has a keychain. Publish the next version from its current head.',
    );
  }
}
