import { Signature } from '@haskou/pigeon-swarm-crypto';

import { IdentitySignaturePayload } from '../IdentitySignaturePayload';
import { DeviceCredential } from '../value-objects/DeviceCredential';

export class IdentitySignatureDomainService {
  public getCanonicalSigningContent(payload: IdentitySignaturePayload): string {
    return JSON.stringify(payload.toPrimitives());
  }

  public isValidSignature(
    credential: DeviceCredential,
    payload: IdentitySignaturePayload,
    signature: Signature,
  ): boolean {
    return credential.isValidSignature(
      this.getCanonicalSigningContent(payload),
      signature,
    );
  }
}
