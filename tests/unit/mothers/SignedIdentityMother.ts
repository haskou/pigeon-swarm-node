import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityAdmissionProof } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionProof';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

export interface SignedIdentityOptions {
  admissionNonce?: string;
  handle?: string;
  /** Another id for the same key, such as an alias encoding of it. */
  id?: string;
  mailboxHome?: string;
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

  public mineAdmissionNonce(networks: string[]): string {
    return new IdentityAdmissionProof(this.id, networks).mine();
  }

  /** A nonce valid for `proven` networks that does not prove `actual`. */
  public mineNonceNotCovering(proven: string[], actual: string[]): string {
    return new IdentityAdmissionProof(this.id, proven).mine(
      (nonce) => !new IdentityAdmissionProof(this.id, actual).isValid(nonce),
    );
  }

  public get id(): string {
    return new IdentityId(this.keyPair.toPrimitives().publicKey).valueOf();
  }

  public build(options: SignedIdentityOptions = {}): Identity {
    return Identity.fromPrimitives(this.primitives(options));
  }

  /**
   * The signed record as received from the network, without constructing the
   * identity: a record under an id the signature cannot verify for (an alias
   * encoding of the key) cannot be constructed.
   */
  public primitives(options: SignedIdentityOptions = {}): IdentityPrimitives {
    const id = options.id ?? this.id;
    const networks = options.networks ?? [
      '550e8400-e29b-41d4-a716-446655440000',
    ];
    const payload = {
      admissionNonce:
        options.admissionNonce ??
        new IdentityAdmissionProof(id, networks).mine(),
      authorizationRevision: 0,
      deviceCredential: this.deviceCredential.valueOf(),
      deviceCredentialCommitment: this.deviceCredential
        .getCommitment()
        .valueOf(),
      id,
      mailboxHome: options.mailboxHome,
      networks,
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

    return {
      ...payload,
      signature: signature.valueOf(),
    };
  }
}
