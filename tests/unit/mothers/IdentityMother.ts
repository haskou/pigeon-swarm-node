import { Identity } from '@app/contexts/identities/domain/Identity';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { IdentityCid } from '@app/contexts/identities/domain/value-objects/IdentityCid';
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
      'Y5yH7g99lREhHu5Z1FvwQfMMvTyt4VzK/LGyvNGnhHxgWdt6W0ARikwVO6Jef3qzyZaEwjIdaiAi1676jwzaXUu87H27cNg3fJyCMw5Wl5EizFOWx66tT2LZU5dCMlqdQrxn6OXe1TxthYUAQ1LJ4LL3HL9PsOI=.9xWThsS9oVtezFtP.vjHbMus/zBRy93U6aGIo0Q==.2E0i7HotLvQ+42IW2gHyew==',
    ),
  );

  public id: IdentityId = new IdentityId(
    'MCowBQYDK2VwAyEA/F0Ob4wHf4zDpyTntjxjcuFMmbb9uKDa4wb3xCnyVV8=',
  );

  public profile: Profile = new Profile(new ProfileName('John'));

  public networks: NetworkId[] = [
    new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
  ];

  public password: Password = new Password('fixture-password');
  public timestamp: Timestamp = new Timestamp(1773848829055);
  public signature: Signature = new Signature(
    'ta2dfyeYjMKesUJsgAxzYP3k4Zt6YCvgEQDQrVxhzjOPu0xVvhGHb+nYJHRBRDRl41O4gS5u2lrGCspjVD/NCg==',
  );
  public version: IdentityVersion = new IdentityVersion(1);
  public previousCid: IdentityCid | undefined = undefined;

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

  public withPreviousCid(previousCid: IdentityCid | undefined): this {
    this.previousCid = previousCid;

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
      this.previousCid,
    );
  }
}
