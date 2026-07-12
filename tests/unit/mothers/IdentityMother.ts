import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPublication } from '@app/contexts/identities/domain/IdentityPublication';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { EncryptedMasterKey } from '@app/contexts/identities/domain/value-objects/EncryptedMasterKey';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentitySigningKey } from '@app/contexts/identities/domain/value-objects/IdentitySigningKey';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { MasterKeyDerivation } from '@app/contexts/identities/domain/value-objects/MasterKeyDerivation';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import {
  EncryptedKeyPair,
  EncryptedPrivateKey,
  PublicKey,
  Signature,
  Timestamp,
  UniqueObjectArray,
} from '@haskou/value-objects';

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

  public encryptedMasterKey: EncryptedMasterKey = new EncryptedMasterKey(
    'v1.fixture.encrypted-master-key',
  );

  public masterKeyDerivation: MasterKeyDerivation = new MasterKeyDerivation({
    passkeyPrf: {
      algorithm: 'webauthn-prf',
      credentialId: 'fixture-credential-id',
      salt: 'fixture-salt',
      version: 1,
    },
  });

  public profile: Profile = new Profile(new ProfileName('John'));

  public networks: NetworkId[] = [
    new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
  ];

  public password: Password = new Password('Fixture-password12345!');

  public timestamp: Timestamp = new Timestamp(1773848829055);

  public signature: Signature = new Signature(
    'ZG+h/Sof7J5IZ/5xF1g5UxMyxjRQ8d6ia0nkvT22/u52chX27J4Pr0EtZ92gH/LCsa1A63U4Zodnw9ByEtwAAA==',
  );

  public version: IdentityVersion = new IdentityVersion(1);

  public previousIdentityExternalIdentifier:
    IdentityExternalIdentifier | undefined = undefined;

  public withId(id: IdentityId): this {
    this.id = id;

    return this;
  }

  public withEncryptedKeyPair(encryptedKeyPair: EncryptedKeyPair): this {
    this.encryptedKeyPair = encryptedKeyPair;

    return this;
  }

  public withEncryptedMasterKey(encryptedMasterKey: EncryptedMasterKey): this {
    this.encryptedMasterKey = encryptedMasterKey;

    return this;
  }

  public withMasterKeyDerivation(
    masterKeyDerivation: MasterKeyDerivation,
  ): this {
    this.masterKeyDerivation = masterKeyDerivation;

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
      new IdentitySigningKey(this.encryptedKeyPair),
      this.encryptedMasterKey,
      this.masterKeyDerivation,
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
}
