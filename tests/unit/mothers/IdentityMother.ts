import { Identity } from '@app/contexts/identities/domain/Identity';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
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
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=\n-----END PUBLIC KEY-----\n',
    ),
    new EncryptedPrivateKey(
      '2s2IhQsbhsmzNWia+DRGOMIQHEcR+Gi45fSM6Di1FOhOPFTs1NB3Fzhi8/bCEcmGdn0WRq5AjN1pb8iZkZpGpNstPm9v4gcPbGqAUnGCAtAQqiPMiJ1Tr9YQCSIUodxwfowdFvBAZaFGNcoObVoYJgnRjWWq2YQ=.f1itGk2AXdi33/e8.OEIZELL7lzYRXWwFSB0wtA==.CuZAT6/b/TiVLT+sp03ULg==',
    ),
  );

  public id: IdentityId = new IdentityId(
    'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=',
  );

  public profile: Profile = new Profile(new ProfileName('John'));

  public networks: NetworkId[] = [
    new NetworkId('550e8400-e29b-41d4-a716-446655440000'),
  ];

  public timestamp: Timestamp = new Timestamp(1773848829055);
  public signature: Signature = new Signature(
    'lWbIzBOHn7vYKk3WOB9JMvOq9XeXRRy8qvqh8DRPrvUL839Y6DEFGDgPTTMngt+pBugsWSK6LoTKKULTy8joBw==',
  );

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

  public build(): Identity {
    return new Identity(
      this.id,
      this.encryptedKeyPair,
      UniqueObjectArray.fromArray(this.networks),
      this.profile,
      this.timestamp,
      this.signature,
    );
  }
}
