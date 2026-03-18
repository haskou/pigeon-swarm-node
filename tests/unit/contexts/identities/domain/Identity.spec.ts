import { IdentityMustHaveAtLeastOneNetworkError } from '@app/contexts/identities/domain/errors/IdentityMustHaveAtLeastOneNetworkError';
import { InvalidIdentitySignatureError } from '@app/contexts/identities/domain/errors/InvalidIdentitySignatureError';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { faker } from '@faker-js/faker';
import { PrimitiveOf } from '@haskou/value-objects';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('Identity', () => {
  let mother: IdentityMother;

  beforeEach(() => {
    mother = new IdentityMother();
  });

  describe('create', () => {
    it('should create an identity with a valid signature', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();

      expect(primitives.id).toBeDefined();
      expect(primitives.profile.name).toBe(mother.name.valueOf());
      expect(primitives.signature).toBeDefined();
      expect(primitives.timestamp).toBeDefined();
      expect(primitives.encryptedKeyPair.publicKey).toBeDefined();
      expect(primitives.encryptedKeyPair.encryptedPrivateKey).toBeDefined();
    });

    it('should record an IdentityWasCreatedEvent', async () => {
      const identity = await mother.build();

      const events = identity.pullDomainEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(IdentityWasCreatedEvent);
    });

    it('should create an identity with multiple networks', async () => {
      const networks = [
        new NetworkId(faker.string.uuid()),
        new NetworkId(faker.string.uuid()),
      ];
      const identity = await mother.withNetworks(networks).build();
      const primitives = identity.toPrimitives();

      expect(primitives.networks).toHaveLength(2);
      expect(primitives.networks).toEqual(
        networks.map((network) => network.valueOf()),
      );
    });

    it('should throw IdentityMustHaveAtLeastOneNetworkError when networks is empty', async () => {
      const emptyNetworks: NetworkId[] = [];
      const identity = await mother
        .withNetworks([new NetworkId(faker.string.uuid())])
        .build();
      const primitives = identity.toPrimitives();
      const tampered: PrimitiveOf<Identity> = {
        ...primitives,
        networks: emptyNetworks.map((network) => network.valueOf()),
      };

      expect(() => mother.buildFromPrimitives(tampered)).toThrow(
        IdentityMustHaveAtLeastOneNetworkError,
      );
    });
  });

  describe('fromPrimitives', () => {
    it('should create an identity from valid primitives', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();

      const restored = mother.buildFromPrimitives(primitives);

      expect(restored.toPrimitives()).toEqual(primitives);
    });

    it('should throw InvalidIdentitySignatureError with tampered primitives', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();
      const tampered: PrimitiveOf<Identity> = {
        ...primitives,
        timestamp: primitives.timestamp + 1,
      };

      expect(() => mother.buildFromPrimitives(tampered)).toThrow(
        InvalidIdentitySignatureError,
      );
    });
  });

  describe('toPrimitives', () => {
    it('should return correct primitives', async () => {
      const identity = await mother.build();
      const primitives = identity.toPrimitives();

      expect(primitives).toEqual({
        encryptedKeyPair: expect.objectContaining({
          encryptedPrivateKey: expect.any(String),
          publicKey: expect.any(String),
        }),
        id: primitives.encryptedKeyPair.publicKey,
        networks: expect.arrayContaining([expect.any(String)]),
        profile: {
          biography: undefined,
          name: mother.name.valueOf(),
          picture: undefined,
        },
        signature: expect.any(String),
        timestamp: expect.any(Number),
      });
    });

    it('should include all network ids in primitives', async () => {
      const networks = [
        new NetworkId(faker.string.uuid()),
        new NetworkId(faker.string.uuid()),
        new NetworkId(faker.string.uuid()),
      ];
      const identity = await mother.withNetworks(networks).build();
      const primitives = identity.toPrimitives();

      expect(primitives.networks).toHaveLength(3);
      expect(primitives.networks).toEqual(
        networks.map((network) => network.valueOf()),
      );
    });
  });
});
