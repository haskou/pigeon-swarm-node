import { KeychainSignature } from '@haskou/pigeon-swarm-crypto';

import { Keychain, KeychainSignaturePayload } from '../Keychain';

export default class KeychainSignatureDomainService {
  public getCanonicalSigningContent(payload: KeychainSignaturePayload): string {
    return KeychainSignature.signingContent(payload.toPrimitives());
  }

  public isValidSignature(keychain: Keychain): boolean {
    return keychain
      .getOwnerPublicKey()
      .isValidSignature(
        this.getCanonicalSigningContent(keychain.getSignaturePayload()),
        keychain.getSignature(),
      );
  }
}
