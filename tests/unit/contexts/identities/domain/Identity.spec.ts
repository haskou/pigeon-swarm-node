import { InvalidIdentitySignatureError } from '@app/contexts/identities/domain/errors/InvalidIdentitySignatureError';
import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { Identity } from '@app/contexts/identities/domain/Identity';
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
        profile: {
          biography: undefined,
          name: mother.name.valueOf(),
          picture: undefined,
        },
        signature: expect.any(String),
        timestamp: expect.any(Number),
      });
    });
  });
});
