import { IdentityCannotLeaveNetworkError } from '@app/contexts/identities/domain/errors/IdentityCannotLeaveNetworkError';
import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { IdentityMustHaveAtLeastOneNetworkError } from '@app/contexts/identities/domain/errors/IdentityMustHaveAtLeastOneNetworkError';
import { InvalidIdentitySignatureError } from '@app/contexts/identities/domain/errors/InvalidIdentitySignatureError';
import { InvalidProfileBannerError } from '@app/contexts/identities/domain/errors/InvalidProfileBannerError';
import { InvalidProfileImageError } from '@app/contexts/identities/domain/errors/InvalidProfileImageError';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { IdentityWasUpdatedEvent } from '@app/contexts/identities/domain/events/IdentityWasUpdatedEvent';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { faker } from '@faker-js/faker';
import { EncryptedKeyPair, PrimitiveOf } from '@haskou/value-objects';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('Identity', () => {
  let mother: IdentityMother;
  const validPassword = 'Valid-password11!';

  beforeEach(() => {
    mother = new IdentityMother();
  });

  describe('build from mother', () => {
    it('should create an identity with a valid signature', () => {
      const identity = mother.build();
      const primitives = identity.toPrimitives();

      expect(primitives.id).toBeDefined();
      expect(primitives.id).toBe(mother.id.valueOf());
      expect(primitives.profile).toEqual(mother.profile.toPrimitives());
      expect(primitives.networks).toEqual(
        mother.networks.map((network) => network.valueOf()),
      );
      expect(primitives.previousIdentityExternalIdentifier).toBeUndefined();
      expect(primitives.signature).toBeDefined();
      expect(primitives.timestamp).toBe(mother.timestamp.valueOf());
      expect(primitives.version).toBe(mother.version.valueOf());
      expect(primitives.encryptedKeyPair).toEqual(
        mother.encryptedKeyPair.toPrimitives(),
      );
      expect(primitives.encryptedMasterKey).toBe(
        mother.encryptedMasterKey.valueOf(),
      );
      expect(primitives.masterKeyDerivation).toEqual(
        mother.masterKeyDerivation.toPrimitives(),
      );
    });

    it('should create an identity from valid primitives', () => {
      const identity = mother.build();
      const primitives = identity.toPrimitives();

      const restored = Identity.fromPrimitives(primitives);

      expect(restored.toPrimitives()).toEqual(primitives);
    });

    it('should throw InvalidIdentitySignatureError with tampered primitives', () => {
      const identity = mother.build();
      const primitives = identity.toPrimitives();
      const tampered: PrimitiveOf<Identity> = {
        ...primitives,
        timestamp: primitives.timestamp + 1,
      };

      expect(() => Identity.fromPrimitives(tampered)).toThrow(
        InvalidIdentitySignatureError,
      );
    });

    it('should throw InvalidIdentitySignatureError when version is tampered', () => {
      const identity = mother.build();
      const primitives = identity.toPrimitives();
      const tampered: PrimitiveOf<Identity> = {
        ...primitives,
        version: primitives.version + 1,
      };

      expect(() => Identity.fromPrimitives(tampered)).toThrow(
        InvalidIdentitySignatureError,
      );
    });

    it('should throw InvalidIdentitySignatureError when encrypted master key is tampered', () => {
      const identity = mother.build();
      const primitives = identity.toPrimitives();
      const tampered: PrimitiveOf<Identity> = {
        ...primitives,
        encryptedMasterKey: 'tampered-encrypted-master-key',
      };

      expect(() => Identity.fromPrimitives(tampered)).toThrow(
        InvalidIdentitySignatureError,
      );
    });

    it('should throw InvalidIdentitySignatureError when master key derivation is tampered', () => {
      const identity = mother.build();
      const primitives = identity.toPrimitives();
      const tampered: PrimitiveOf<Identity> = {
        ...primitives,
        masterKeyDerivation: {
          ...primitives.masterKeyDerivation,
          version: 2,
        },
      };

      expect(() => Identity.fromPrimitives(tampered)).toThrow(
        InvalidIdentitySignatureError,
      );
    });

    it('should throw InvalidIdentitySignatureError when previousIdentityExternalIdentifier is tampered', () => {
      const identity = mother.build();
      const primitives = identity.toPrimitives();
      const tampered: PrimitiveOf<Identity> = {
        ...primitives,
        previousIdentityExternalIdentifier: 'bafytamperedidentity',
      };

      expect(() => Identity.fromPrimitives(tampered)).toThrow(
        InvalidIdentitySignatureError,
      );
    });

    it('should reject a payload signed by a different key than the identity id', async () => {
      const networkId = new NetworkId(faker.string.uuid());
      const attackerIdentity = await Identity.create(
        new ProfileName('Mallory'),
        new Password(validPassword),
        [networkId],
      );
      const victimIdentity = await Identity.create(
        new ProfileName('Victim'),
        new Password(validPassword),
        [networkId],
      );
      const attackerPrimitives = attackerIdentity.toPrimitives();
      const spoofedPrimitives: PrimitiveOf<Identity> = {
        ...attackerPrimitives,
        id: victimIdentity.toPrimitives().id,
        signature: '',
      };
      const spoofedSignature =
        await new IdentitySignatureDomainService().generateSignature(
          spoofedPrimitives,
          EncryptedKeyPair.fromPrimitives(
            attackerPrimitives.encryptedKeyPair,
          ),
          new Password(validPassword),
        );

      expect(() =>
        Identity.fromPrimitives({
          ...spoofedPrimitives,
          signature: spoofedSignature.valueOf(),
        }),
      ).toThrow(InvalidIdentitySignatureError);
    });

    it('should return correct primitives', () => {
      const identity = mother.build();

      expect(identity.toPrimitives()).toEqual({
        encryptedKeyPair: mother.encryptedKeyPair.toPrimitives(),
        encryptedMasterKey: mother.encryptedMasterKey.valueOf(),
        id: mother.id.valueOf(),
        masterKeyDerivation: mother.masterKeyDerivation.toPrimitives(),
        networks: mother.networks.map((network) => network.valueOf()),
        previousIdentityExternalIdentifier:
          mother.previousIdentityExternalIdentifier?.valueOf(),
        profile: mother.profile.toPrimitives(),
        signature: mother.signature.valueOf(),
        timestamp: mother.timestamp.valueOf(),
        version: mother.version.valueOf(),
      });
    });
  });

  describe('create', () => {
    it('should record an IdentityWasCreatedEvent', async () => {
      const identity = await Identity.create(
        new ProfileName(faker.person.firstName().substring(0, 20)),
        new Password(validPassword),
        [new NetworkId(faker.string.uuid())],
      );

      const events = identity.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(IdentityWasCreatedEvent);
    });

    it('should create an identity with multiple networks', async () => {
      const networks = [
        new NetworkId(faker.string.uuid()),
        new NetworkId(faker.string.uuid()),
      ];
      const identity = await Identity.create(
        new ProfileName(faker.person.firstName().substring(0, 20)),
        new Password(validPassword),
        networks,
      );
      const primitives = identity.toPrimitives();

      expect(primitives.networks).toHaveLength(2);
      expect(primitives.previousIdentityExternalIdentifier).toBeUndefined();
      expect(primitives.version).toBe(1);
      expect(primitives.networks).toEqual(
        networks.map((network) => network.valueOf()),
      );
    });

    it('should throw IdentityMustHaveAtLeastOneNetworkError when networks is empty', async () => {
      await expect(
        Identity.create(
          new ProfileName(faker.person.firstName().substring(0, 20)),
          new Password(validPassword),
          [],
        ),
      ).rejects.toThrow(IdentityMustHaveAtLeastOneNetworkError);
    });

    it('should include all network ids in primitives', async () => {
      const networks = [
        new NetworkId(faker.string.uuid()),
        new NetworkId(faker.string.uuid()),
        new NetworkId(faker.string.uuid()),
      ];
      const identity = await Identity.create(
        new ProfileName(faker.person.firstName().substring(0, 20)),
        new Password(validPassword),
        networks,
      );
      const primitives = identity.toPrimitives();

      expect(primitives.networks).toHaveLength(3);
      expect(primitives.networks).toEqual(
        networks.map((network) => network.valueOf()),
      );
    });
  });

  describe('updateProfile', () => {
    it('should create the next signed identity version', async () => {
      const identity = mother.build();
      const previousIdentityExternalIdentifier = new IdentityExternalIdentifier(
        'bafycurrentidentity',
      );
      const profile = new Profile(new ProfileName('Jane'));

      const updatedIdentity = await identity.updateProfile(
        profile,
        mother.password,
        previousIdentityExternalIdentifier,
      );
      const primitives = updatedIdentity.toPrimitives();

      expect(primitives.id).toBe(identity.toPrimitives().id);
      expect(primitives.profile).toEqual(profile.toPrimitives());
      expect(primitives.previousIdentityExternalIdentifier).toBe(
        previousIdentityExternalIdentifier.valueOf(),
      );
      expect(primitives.version).toBe(2);
      expect(updatedIdentity.usesSameSigningKeyAs(identity)).toBe(true);
      expect(updatedIdentity.pullDomainEvents()[0]).toBeInstanceOf(
        IdentityWasUpdatedEvent,
      );
    });
  });

  describe('profile image', () => {
    it('should reject embedded data URL profile images', () => {
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

    it('should reject embedded data URL banners', () => {
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

  describe('updateNetworks', () => {
    it('should create the next signed identity with new networks', async () => {
      const identity = mother.build();
      const previousIdentityExternalIdentifier = new IdentityExternalIdentifier(
        'bafycurrentidentity',
      );
      const networks = [
        ...mother.networks,
        new NetworkId(faker.string.uuid()),
        new NetworkId(faker.string.uuid()),
      ];

      const updatedIdentity = await identity.updateNetworks(
        networks,
        mother.password,
        previousIdentityExternalIdentifier,
      );
      const primitives = updatedIdentity.toPrimitives();

      expect(primitives.networks).toEqual(
        networks.map((network) => network.valueOf()),
      );
      expect(primitives.previousIdentityExternalIdentifier).toBe(
        previousIdentityExternalIdentifier.valueOf(),
      );
      expect(primitives.version).toBe(2);
      expect(updatedIdentity.pullDomainEvents()[0]).toBeInstanceOf(
        IdentityWasUpdatedEvent,
      );
    });

    it('should throw IdentityCannotLeaveNetworkError when a network is removed', async () => {
      const firstAdditionalNetwork = new NetworkId(faker.string.uuid());
      const secondAdditionalNetwork = new NetworkId(faker.string.uuid());
      const identity = mother.build();
      const identityWithAdditionalNetworks = await identity.updateNetworks(
        [...mother.networks, firstAdditionalNetwork, secondAdditionalNetwork],
        mother.password,
        new IdentityExternalIdentifier('bafycurrentidentity'),
      );

      await expect(
        identityWithAdditionalNetworks.updateNetworks(
          [firstAdditionalNetwork, secondAdditionalNetwork],
          mother.password,
          new IdentityExternalIdentifier('bafynextidentity'),
        ),
      ).rejects.toThrow(IdentityCannotLeaveNetworkError);
    });
  });
});
