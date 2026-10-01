import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { IdentityPublication } from '@app/contexts/identities/domain/IdentityPublication';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceCredentialCommitment } from '@app/contexts/identities/domain/value-objects/DeviceCredentialCommitment';
import { IdentityAuthorizationRevision } from '@app/contexts/identities/domain/value-objects/IdentityAuthorizationRevision';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  EncryptedKeyPair,
  EncryptedPrivateKey,
  PublicKey,
  Signature,
} from '@haskou/pigeon-swarm-crypto';
import { Timestamp, UniqueObjectArray } from '@haskou/value-objects';

export class IdentityMother {
  public encryptedKeyPair: EncryptedKeyPair = new EncryptedKeyPair(
    PublicKey.fromPEM(
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=\n-----END PUBLIC KEY-----\n',
    ),
    new EncryptedPrivateKey(
      'v3.scrypt.N16384.r8.p5.m8IZ4IYeJjHAHvBkHJYb9A==.roxtZ0JdN4fw7ozz.huL0saZGdGBQa06UXOYG/A==.c3mZ6RULl43mElqMlLVBGJZEdJ563YlaFKmNviyIpK81orJA/Pf038ClcscpUPtxKup8jCGCOfKJzmEWt5V014w62K/aCOBFkL60zwAbhCfSknuO5vX/qpieCrgO2YpSFLqu6SxkBs/zN42nL8TCHucmK+w+4bc=',
    ),
  );

  public id: IdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=',
  );

  public deviceCredential: DeviceCredential = DeviceCredential.fromString(
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAnbnkVQtA3GY3Ag1NixZgrk8S/emZiEuvCnRLrfGZJLs=\n-----END PUBLIC KEY-----\n',
  );

  public deviceCredentialCommitment: DeviceCredentialCommitment =
    this.deviceCredential.getCommitment();

  public recoveryAuthority: RecoveryAuthority = RecoveryAuthority.fromString(
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAjWO3/ZwPzc9aKCos71hCsW0bIx5uiBG4rZGqz9R/i4E=\n-----END PUBLIC KEY-----\n',
  );

  public authorizationRevision: IdentityAuthorizationRevision =
    IdentityAuthorizationRevision.initial();

  public profile: Profile = new Profile(new ProfileName('John'));

  public networks: NetworkId[] = [
    new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
  ];

  public password: Password = new Password('Fixture-password12345!');

  public timestamp: Timestamp = new Timestamp(1773848829055);

  public signature: Signature = new Signature(
    'm7XqWFHeZqRuuQplLYI7AdwTs79+stkLF6HZxl6rU+/oGIdXcQnNnUxziVLhAUJymE2sAuR5M1cT16ZrNuhvAg==',
  );

  public version: IdentityVersion = new IdentityVersion(1);

  public previousIdentityExternalIdentifier:
    IdentityExternalIdentifier | undefined = undefined;

  public withId(id: IdentityId): this {
    this.id = id;

    return this;
  }

  public withNetworks(networks: NetworkId[]): this {
    this.networks = networks;

    return this;
  }

  public withProfile(profile: Profile): this {
    this.profile = profile;

    return this;
  }

  public withTimestamp(timestamp: Timestamp): this {
    this.timestamp = timestamp;

    return this;
  }

  public withSignature(signature: Signature): this {
    this.signature = signature;

    return this;
  }

  public withVersion(version: IdentityVersion): this {
    this.version = version;

    return this;
  }

  public withPreviousIdentityExternalIdentifier(
    previousIdentityExternalIdentifier: IdentityExternalIdentifier | undefined,
  ): this {
    this.previousIdentityExternalIdentifier =
      previousIdentityExternalIdentifier;

    return this;
  }

  public build(): Identity {
    return new Identity(
      this.id,
      this.deviceCredential,
      this.deviceCredentialCommitment,
      this.recoveryAuthority,
      this.authorizationRevision,
      UniqueObjectArray.fromArray(this.networks),
      new IdentityPublication(
        this.profile,
        this.timestamp,
        this.signature,
        this.version,
        this.previousIdentityExternalIdentifier,
      ),
    );
  }

  public async buildNext(
    overrides: Partial<Omit<IdentityPrimitives, 'signature'>> = {},
  ): Promise<Identity> {
    const current = this.build().toPrimitives();
    const unsigned: Omit<IdentityPrimitives, 'signature'> = {
      authorizationRevision: current.authorizationRevision,
      deviceCredential: current.deviceCredential,
      deviceCredentialCommitment: current.deviceCredentialCommitment,
      id: current.id,
      networks: current.networks,
      previousIdentityExternalIdentifier: 'bafypreviousidentity',
      profile: current.profile,
      recoveryAuthority: current.recoveryAuthority,
      timestamp: current.timestamp + 1,
      version: current.version + 1,
      ...overrides,
    };
    const signature = await this.encryptedKeyPair.sign(
      new IdentitySignatureDomainService().getCanonicalSigningContent(
        IdentitySignaturePayload.fromPrimitives(unsigned),
      ),
      this.password,
    );

    return Identity.fromPrimitives({
      ...unsigned,
      signature: signature.valueOf(),
    });
  }
}
