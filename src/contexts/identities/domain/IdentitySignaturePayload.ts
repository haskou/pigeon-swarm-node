import type { IdentityPrimitives } from './IdentityPrimitives';

export class IdentitySignaturePayload {
  public static fromPrimitives(
    primitives: IdentityPrimitives | Omit<IdentityPrimitives, 'signature'>,
  ): IdentitySignaturePayload {
    return new IdentitySignaturePayload({
      authorizationRevision: primitives.authorizationRevision,
      deviceCredentialCommitment: primitives.deviceCredentialCommitment,
      id: primitives.id,
      networks: primitives.networks,
      previousIdentityExternalIdentifier:
        primitives.previousIdentityExternalIdentifier,
      profile: primitives.profile,
      recoveryAuthority: primitives.recoveryAuthority,
      timestamp: primitives.timestamp,
      version: primitives.version,
    });
  }

  private constructor(
    private readonly primitives: Omit<IdentityPrimitives, 'signature'>,
  ) {}

  public toPrimitives(): Omit<IdentityPrimitives, 'signature'> {
    return {
      authorizationRevision: this.primitives.authorizationRevision,
      deviceCredentialCommitment: this.primitives.deviceCredentialCommitment,
      id: this.primitives.id,
      networks: this.primitives.networks,
      previousIdentityExternalIdentifier:
        this.primitives.previousIdentityExternalIdentifier,
      profile: this.primitives.profile,
      recoveryAuthority: this.primitives.recoveryAuthority,
      timestamp: this.primitives.timestamp,
      version: this.primitives.version,
    };
  }
}
