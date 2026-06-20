import { KeychainCandidate } from '@app/contexts/keychains/domain/KeychainCandidate';

import { KeychainResource } from '../resources/KeychainResource';

export class KeychainViewModel {
  constructor(private readonly candidate: KeychainCandidate) {}

  public toResource(): KeychainResource {
    const primitives = this.candidate.getKeychain().toPrimitives();

    return {
      encryptedPayload: primitives.encryptedPayload,
      keychainExternalIdentifier: this.candidate
        .getExternalIdentifier()
        .valueOf(),
      ownerIdentityId: primitives.ownerIdentityId,
      previousKeychainExternalIdentifier:
        primitives.previousKeychainExternalIdentifier,
      signature: primitives.signature,
      timestamp: primitives.timestamp,
      version: primitives.version,
    };
  }
}
