import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { EncryptedKeyPair, Signature } from '@haskou/value-objects';

import { IdentitySignaturePayload } from '../IdentitySignaturePayload';

export class IdentitySignatureDomainService {
  public getCanonicalSigningContent(payload: IdentitySignaturePayload): string {
    return JSON.stringify(payload.toPrimitives());
  }

  public async generateSignature(
    payload: IdentitySignaturePayload,
    encryptedKeyPair: EncryptedKeyPair,
    password: Password,
  ): Promise<Signature> {
    return encryptedKeyPair.sign(
      this.getCanonicalSigningContent(payload),
      password,
    );
  }

  public isValidSignature(
    identityId: IdentityId,
    payload: IdentitySignaturePayload,
    signature: Signature,
  ): boolean {
    return identityId.isValidSignature(
      this.getCanonicalSigningContent(payload),
      signature,
    );
  }
}
