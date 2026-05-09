import { KeychainCandidate } from '@app/contexts/keychains/domain/repositories/KeychainRepository';

import { KeychainResource } from '../resources/KeychainResource';

export class KeychainViewModel {
  constructor(private readonly candidate: KeychainCandidate) {}

  public toResource(): KeychainResource {
    const primitives = this.candidate.keychain.toPrimitives();

    return {
      encryptedPayload: primitives.encryptedPayload,
      keychainExternalIdentifier: this.candidate.externalIdentifier.valueOf(),
      ownerIdentityId: primitives.ownerIdentityId,
      previousKeychainExternalIdentifier:
        primitives.previousKeychainExternalIdentifier,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
    };
  }
}
