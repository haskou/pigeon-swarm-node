import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { Signature } from '@haskou/value-objects';

import { IdentitySignaturePayload } from '../IdentitySignaturePayload';
import { IdentitySigningKey } from '../value-objects/IdentitySigningKey';

export class IdentitySignatureDomainService {
  public getCanonicalSigningContent(payload: IdentitySignaturePayload): string {
    return JSON.stringify(payload.toPrimitives());
  }

  public async generateSignature(
    payload: IdentitySignaturePayload,
    signingKey: IdentitySigningKey,
    password: Password,
  ): Promise<Signature> {
    return signingKey.sign(this.getCanonicalSigningContent(payload), password);
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
