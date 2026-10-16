import { IdentitySignature, Signature } from '@haskou/pigeon-swarm-crypto';

import { IdentitySignaturePayload } from '../IdentitySignaturePayload';
import { DeviceCredential } from '../value-objects/DeviceCredential';

export class IdentitySignatureDomainService {
  public getCanonicalSigningContent(payload: IdentitySignaturePayload): string {
    return IdentitySignature.signingContent(payload.toPrimitives());
  }

  public isValidSignature(
    credential: DeviceCredential,
    payload: IdentitySignaturePayload,
    signature: Signature,
  ): boolean {
    try {
      IdentitySignature.verify(payload.toPrimitives(), signature, credential);

      return true;
    } catch {
      return false;
    }
  }
}
