import { Identity } from '@app/contexts/identities/domain/Identity';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
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
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA/F0Ob4wHf4zDpyTntjxjcuFMmbb9uKDa4wb3xCnyVV8=\n-----END PUBLIC KEY-----\n',
    ),
    new EncryptedPrivateKey(
      'v2.scrypt.N16384.r8.p1.pX6RQxiWclXHSfpuc8FVtA==.mD4gxsvXwO+DXHmH.HHKbJ5okm2odc0rMTWb/Ug==.hf8ooIEg4R2airdHlpnTmtxlQBKbnTjRqb6FwwC91YSnd6N03xc0CwKBnyPv2v4NHkKPf57UY+UvDVkWLFkPciVIqCFVN14VOHS5XgelwqB8QWln4vsbsx9Ya5lKhKqtOPctyOCTlarXC+05KW4avyrVlJI5pdQ=',
    ),
  );

  public id: IdentityId = new IdentityId(
    'MCowBQYDK2VwAyEA/F0Ob4wHf4zDpyTntjxjcuFMmbb9uKDa4wb3xCnyVV8=',
  );

  public profile: Profile = new Profile(new ProfileName('John'));

  public networks: NetworkId[] = [
    new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
  ];

  public password: Password = new Password('Fixture-password!');

  public timestamp: Timestamp = new Timestamp(1773848829055);

  public signature: Signature = new Signature(
    'WZ3ndjkTKbmWN++lFJ67tum7BXg97ryd4OvNoB/hu6QBAGIbd2jTLZYPuCPJn9SbzYbGWUVskGHes06L+wU/Cg==',
  );

  public version: IdentityVersion = new IdentityVersion(1);

  public previousIdentityExternalIdentifier:
    | IdentityExternalIdentifier
    | undefined = undefined;

  public withId(id: IdentityId): this {
    this.id = id;

    return this;
  }

  public withEncryptedKeyPair(encryptedKeyPair: EncryptedKeyPair): this {
    this.encryptedKeyPair = encryptedKeyPair;

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
      this.encryptedKeyPair,
      UniqueObjectArray.fromArray(this.networks),
      this.profile,
      this.timestamp,
      this.signature,
      this.version,
      this.previousIdentityExternalIdentifier,
    );
  }
}
