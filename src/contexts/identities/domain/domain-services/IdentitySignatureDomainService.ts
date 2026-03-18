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
      profile: payload.profile,
      timestamp: payload.timestamp,
    };
  }

  public async generateSignature(
    payload: IdentitySignaturePayload,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(
      JSON.stringify(this.getCanonicalPayload(payload)),
      password,
    );
  }

  public isValidSignature(
    encryptedKeyPair: EncryptedKeyPair,
    payload: IdentitySignaturePayload,
    signature: Signature,
  ): boolean {
    return encryptedKeyPair.isValidSignature(
      JSON.stringify(this.getCanonicalPayload(payload)),
      signature,
    );
  }
}
