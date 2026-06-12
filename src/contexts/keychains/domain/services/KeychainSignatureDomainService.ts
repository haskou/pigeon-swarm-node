import { Keychain, KeychainSignaturePayload } from '../Keychain';

export default class KeychainSignatureDomainService {
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

  public serializePayload(payload: KeychainSignaturePayload): string {
    return JSON.stringify(this.getCanonicalPayload(payload));
  }

  public isValidSignature(keychain: Keychain): boolean {
    return keychain
      .getOwnerPublicKey()
      .isValidSignature(
        this.serializePayload(keychain.getSignaturePayload()),
        keychain.getSignature(),
      );
  }
}
