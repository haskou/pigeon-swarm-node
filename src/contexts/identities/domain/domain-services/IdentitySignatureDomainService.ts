import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { EncryptedKeyPair, Signature } from '@haskou/value-objects';

import { IdentitySignaturePayload } from './types/IdentitySignaturePayload';

export class IdentitySignatureDomainService {
  private getCanonicalPayload(
    payload: IdentitySignaturePayload,
  ): IdentitySignaturePayload {
    return {
      encryptedKeyPair: payload.encryptedKeyPair,
      encryptedMasterKey: payload.encryptedMasterKey,
      id: payload.id,
      masterKeyDerivation: payload.masterKeyDerivation,
      networks: payload.networks,
      previousIdentityExternalIdentifier:
        payload.previousIdentityExternalIdentifier,
      profile: payload.profile,
      timestamp: payload.timestamp,
      version: payload.version,
    };
  }

  public serializePayload(payload: IdentitySignaturePayload): string {
    return JSON.stringify(this.getCanonicalPayload(payload));
  }

  public async generateSignature(
    payload: IdentitySignaturePayload,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(this.serializePayload(payload), password);
  }

  public isValidSignature(
    identityId: IdentityId,
    payload: IdentitySignaturePayload,
    signature: Signature,
  ): boolean {
    return identityId.isValidSignature(
      this.serializePayload(payload),
      signature,
    );
  }
}
