import { KeychainSignature } from '@haskou/pigeon-swarm-crypto';

import { Keychain, KeychainSignaturePayload } from '../Keychain';

export default class KeychainSignatureDomainService {
  public getCanonicalSigningContent(payload: KeychainSignaturePayload): string {
    return KeychainSignature.signingContent(payload.toPrimitives());
  }

  public isValidSignature(keychain: Keychain): boolean {
    try {
      KeychainSignature.verify(
        keychain.getSignaturePayload().toPrimitives(),
        keychain.getSignature(),
        keychain.getOwnerPublicKey(),
      );

      return true;
    } catch {
      return false;
    }
  }
}
