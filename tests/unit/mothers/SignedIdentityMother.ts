import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

export interface SignedIdentityOptions {
  handle?: string;
  networks?: string[];
  previousIdentityExternalIdentifier?: string;
  timestamp?: number;
  version?: number;
}

/** Builds identities signed by a freshly generated key pair. */
export class SignedIdentityMother {
  private constructor(
    public readonly keyPair: KeyPair,
    private readonly deviceCredential: DeviceCredential,
    private readonly recoveryAuthority: string,
  ) {}

  public static async create(): Promise<SignedIdentityMother> {
    const keyPair = await KeyPair.generate();
    const deviceKeyPair = await KeyPair.generate();
    const recoveryKeyPair = await KeyPair.generate();

    return new SignedIdentityMother(
      keyPair,
      DeviceCredential.fromString(deviceKeyPair.toPrimitives().publicKey),
      recoveryKeyPair.toPrimitives().publicKey,
    );
  }

  public get id(): string {
    return new IdentityId(this.keyPair.toPrimitives().publicKey).valueOf();
  }

  public build(options: SignedIdentityOptions = {}): Identity {
    const payload = {
      authorizationRevision: 0,
      deviceCredential: this.deviceCredential.valueOf(),
      deviceCredentialCommitment: this.deviceCredential
        .getCommitment()
        .valueOf(),
      id: this.id,
      networks: options.networks ?? ['550e8400-e29b-41d4-a716-446655440000'],
      previousIdentityExternalIdentifier:
        options.previousIdentityExternalIdentifier,
      profile: new Profile(
        new ProfileName('Signed'),
        undefined,
        undefined,
        undefined,
        options.handle ? new ProfileHandle(options.handle) : undefined,
      ).toPrimitives(),
      recoveryAuthority: this.recoveryAuthority,
      timestamp: options.timestamp ?? 1773848829055,
      version: options.version ?? 1,
    };

    const signature = this.keyPair.sign(
      new IdentitySignatureDomainService().getCanonicalSigningContent(
        IdentitySignaturePayload.fromPrimitives(payload),
      ),
    );

    return Identity.fromPrimitives({
      ...payload,
      signature: signature.valueOf(),
    });
  }
}
