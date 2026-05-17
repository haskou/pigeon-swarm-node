import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  EncryptedKeyPair,
  PrimitiveOf,
  Signature,
} from '@haskou/value-objects';

import { Identity } from '../Identity';

type IdentitySignaturePayload = Omit<PrimitiveOf<Identity>, 'signature'>;

export class IdentitySignatureDomainService {
  private getCanonicalPayload(
    payload: IdentitySignaturePayload,
  ): IdentitySignaturePayload {
    return {
      encryptedKeyPair: payload.encryptedKeyPair,
      id: payload.id,
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
    encryptedKeyPair: EncryptedKeyPair,
    payload: IdentitySignaturePayload,
    signature: Signature,
  ): boolean {
    return encryptedKeyPair.isValidSignature(
      this.serializePayload(payload),
      signature,
    );
  }
}
