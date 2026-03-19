import { IdentityMustHaveAtLeastOneNetworkError } from '@app/contexts/identities/domain/errors/IdentityMustHaveAtLeastOneNetworkError';
import { InvalidIdentitySignatureError } from '@app/contexts/identities/domain/errors/InvalidIdentitySignatureError';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Password } from '@app/contexts/shared/domain/value-objects/Password';
import { faker } from '@faker-js/faker';
import { PrimitiveOf } from '@haskou/value-objects';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('Identity', () => {
  let mother: IdentityMother;

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
      expect(primitives.signature).toBeDefined();
      expect(primitives.timestamp).toBe(mother.timestamp.valueOf());
      expect(primitives.encryptedKeyPair).toEqual(
        mother.encryptedKeyPair.toPrimitives(),
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

    it('should return correct primitives', () => {
      const identity = mother.build();

      expect(identity.toPrimitives()).toEqual({
        encryptedKeyPair: mother.encryptedKeyPair.toPrimitives(),
        id: mother.id.valueOf(),
        networks: mother.networks.map((network) => network.valueOf()),
        profile: mother.profile.toPrimitives(),
        signature: mother.signature.valueOf(),
        timestamp: mother.timestamp.valueOf(),
      });
    });
  });

  describe('create', () => {
    it('should record an IdentityWasCreatedEvent', async () => {
      const identity = await Identity.create(
        new ProfileName(faker.person.firstName().substring(0, 20)),
        new Password(faker.internet.password({ length: 12 })),
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
        new Password(faker.internet.password({ length: 12 })),
        networks,
      );
      const primitives = identity.toPrimitives();

      expect(primitives.networks).toHaveLength(2);
      expect(primitives.networks).toEqual(
        networks.map((network) => network.valueOf()),
      );
    });

    it('should throw IdentityMustHaveAtLeastOneNetworkError when networks is empty', async () => {
      await expect(
        Identity.create(
          new ProfileName(faker.person.firstName().substring(0, 20)),
          new Password(faker.internet.password({ length: 12 })),
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
        new Password(faker.internet.password({ length: 12 })),
        networks,
      );
      const primitives = identity.toPrimitives();

      expect(primitives.networks).toHaveLength(3);
      expect(primitives.networks).toEqual(
        networks.map((network) => network.valueOf()),
      );
    });
  });
});
