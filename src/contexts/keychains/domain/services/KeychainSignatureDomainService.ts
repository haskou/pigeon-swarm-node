import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature } from '@haskou/value-objects';

import { Keychain } from '../Keychain';

type KeychainSignaturePayload = Omit<PrimitiveOf<Keychain>, 'signature'>;

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
    const primitives = keychain.toPrimitives();
    const { signature, ...payload } = primitives;

    return new IdentityId(primitives.ownerIdentityId).isValidSignature(
      JSON.stringify(this.getCanonicalPayload(payload)),
      new Signature(signature),
    );
  }
}
