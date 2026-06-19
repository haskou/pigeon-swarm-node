import { PrimitiveOf } from '@haskou/value-objects';

import type { Identity } from './Identity';

export class IdentitySignaturePayload {
  public static fromPrimitives(
    primitives: Omit<PrimitiveOf<Identity>, 'signature'>,
  ): IdentitySignaturePayload {
    return new IdentitySignaturePayload(primitives);
  }

  private constructor(
    private readonly primitives: Omit<PrimitiveOf<Identity>, 'signature'>,
  ) {}

  public toPrimitives(): Omit<PrimitiveOf<Identity>, 'signature'> {
    return {
      encryptedKeyPair: this.primitives.encryptedKeyPair,
      encryptedMasterKey: this.primitives.encryptedMasterKey,
      id: this.primitives.id,
      masterKeyDerivation: this.primitives.masterKeyDerivation,
      networks: this.primitives.networks,
      previousIdentityExternalIdentifier:
        this.primitives.previousIdentityExternalIdentifier,
      profile: this.primitives.profile,
      timestamp: this.primitives.timestamp,
      version: this.primitives.version,
    };
  }
}
