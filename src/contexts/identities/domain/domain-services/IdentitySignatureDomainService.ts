import { Password } from '@app/contexts/shared/domain/Password';
import {
  EncryptedKeyPair,
  PrimitiveOf,
  Signature,
} from '@haskou/value-objects';
import { Identity } from '../Identity';

type IdentitySignature = Omit<PrimitiveOf<Identity>, 'signature'>;

export class IdentitySignatureDomainService {
  public async generateSignature(
    payload: IdentitySignature,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(
      JSON.stringify({
        id: payload.id,
        encryptedKeyPair: payload.encryptedKeyPair,
        timestamp: payload.timestamp,
      }),
      password,
    );
  }

  public isValidSignature(
    encryptedKeyPair: EncryptedKeyPair,
    payload: PrimitiveOf<Identity>,
    signature: Signature,
  ): boolean {
    return encryptedKeyPair.isValidSignature(
      JSON.stringify({
        id: payload.id,
        encryptedKeyPair: payload.encryptedKeyPair,
        profile: payload.profile,
        timestamp: payload.timestamp,
      }),
      signature,
    );
  }
}
