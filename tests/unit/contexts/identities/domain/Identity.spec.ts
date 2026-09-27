import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { InvalidIdentitySignatureError } from '@app/contexts/identities/domain/errors/InvalidIdentitySignatureError';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { InvalidProfileBannerError } from '@app/contexts/identities/domain/errors/InvalidProfileBannerError';
import { InvalidProfileImageError } from '@app/contexts/identities/domain/errors/InvalidProfileImageError';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe(Identity.name, () => {
  let mother: IdentityMother;

  beforeEach(() => {
    mother = new IdentityMother();
  });

  it('publishes only public genesis authorization material', () => {
    const primitives = mother.build().toPrimitives();

    expect(primitives).toEqual({
      authorizationRevision: mother.authorizationRevision.valueOf(),
      deviceCredentialCommitment: mother.deviceCredentialCommitment.valueOf(),
      id: mother.id.valueOf(),
      networks: mother.networks.map((network) => network.valueOf()),
      previousIdentityExternalIdentifier: undefined,
      profile: mother.profile.toPrimitives(),
      recoveryAuthority: mother.recoveryAuthority.valueOf(),
      signature: mother.signature.valueOf(),
      timestamp: mother.timestamp.valueOf(),
      version: mother.version.valueOf(),
    });
    expect(primitives).not.toHaveProperty('encryptedKeyPair');
    expect(primitives).not.toHaveProperty('encryptedMasterKey');
    expect(primitives).not.toHaveProperty('masterKeyDerivation');
  });

  it('restores a valid signed publication', () => {
    const primitives = mother.build().toPrimitives();

    expect(Identity.fromPrimitives(primitives).toPrimitives()).toEqual(
      primitives,
    );
  });

  it.each([
    [
      'timestamp',
      (value: Omit<IdentityPrimitives, 'signature'>) => ({
        ...value,
        timestamp: value.timestamp + 1,
      }),
    ],
    [
      'version',
      (value: Omit<IdentityPrimitives, 'signature'>) => ({
        ...value,
        version: value.version + 1,
      }),
    ],
    [
      'authorization revision',
      (value: Omit<IdentityPrimitives, 'signature'>) => ({
        ...value,
        authorizationRevision: value.authorizationRevision + 1,
      }),
    ],
    [
      'recovery authority',
      (value: Omit<IdentityPrimitives, 'signature'>) => ({
        ...value,
        recoveryAuthority:
          '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAPW21iqKutjL6ohU77RAPxYEsgrH6RPDhawLJC+DHmZw=\n-----END PUBLIC KEY-----\n',
      }),
    ],
  ])('rejects a tampered %s', (_, tamper) => {
    const primitives = mother.build().toPrimitives();

    expect(() =>
      Identity.fromPrimitives({
        ...tamper(primitives),
        signature: primitives.signature,
      }),
    ).toThrow(InvalidIdentitySignatureError);
  });

  it('rejects a credential commitment that does not identify the genesis key', () => {
    const primitives = mother.build().toPrimitives();

    expect(() =>
      Identity.fromPrimitives({
        ...primitives,
        deviceCredentialCommitment: '0'.repeat(64),
      }),
    ).toThrow(InvalidIdentitySignatureError);
  });

  it('rejects a publication signed by another device credential', async () => {
    const attacker = await KeyPair.generate();
    const victim = await KeyPair.generate();
    const victimCredential = DeviceCredential.fromString(
      victim.toPrimitives().publicKey,
    );
    const unsigned: Omit<IdentityPrimitives, 'signature'> = {
      authorizationRevision: 0,
      deviceCredentialCommitment: victimCredential.getCommitment().valueOf(),
      id: new IdentityId(victim.toPrimitives().publicKey).valueOf(),
      networks: mother.networks.map((network) => network.valueOf()),
      previousIdentityExternalIdentifier: undefined,
      profile: new Profile(new ProfileName('Mallory')).toPrimitives(),
      recoveryAuthority: mother.recoveryAuthority.valueOf(),
      timestamp: mother.timestamp.valueOf(),
      version: 1,
    };
    const signature = attacker.sign(
      new IdentitySignatureDomainService().getCanonicalSigningContent(
        IdentitySignaturePayload.fromPrimitives(unsigned),
      ),
    );

    expect(() =>
      Identity.fromPrimitives({
        ...unsigned,
        signature: signature.valueOf(),
      }),
    ).toThrow(InvalidIdentitySignatureError);
  });

  it('rejects embedded data URL profile images', () => {
    expect(() =>
      Profile.fromPrimitives({
        banner: undefined,
        biography: undefined,
        handle: undefined,
        name: 'Jane',
        picture: 'data:image/png;base64,aGVsbG8=',
      }),
    ).toThrow(InvalidProfileImageError);
  });

  it('rejects embedded data URL banners', () => {
    expect(() =>
      Profile.fromPrimitives({
        banner: 'data:image/png;base64,aGVsbG8=',
        biography: undefined,
        handle: undefined,
        name: 'Jane',
        picture: undefined,
      }),
    ).toThrow(InvalidProfileBannerError);
  });
});
