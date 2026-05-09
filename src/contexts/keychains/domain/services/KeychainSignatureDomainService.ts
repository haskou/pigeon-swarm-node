import { Keychain, KeychainSignaturePayload } from '../Keychain';

export class KeychainSignatureDomainService {
  private getCanonicalPayload(
    payload: KeychainSignaturePayload,
  ): KeychainSignaturePayload {
    return {
      encryptedPayload: payload.encryptedPayload,
      ownerIdentityId: payload.ownerIdentityId,
      previousKeychainExternalIdentifier:
        payload.previousKeychainExternalIdentifier,
      timestamp: payload.timestamp,
      version: payload.version,
    };
  }

  public isValidSignature(keychain: Keychain): boolean {
    return keychain
      .getOwnerPublicKey()
      .isValidSignature(
        JSON.stringify(
          this.getCanonicalPayload(keychain.getSignaturePayload()),
        ),
        keychain.getSignature(),
      );
  }
}
