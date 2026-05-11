import { PrimitiveOf } from '@haskou/value-objects';

import { Network } from '../../../../../src/contexts/nodes/domain/Network';
import { NetworkKey } from '../../../../../src/contexts/nodes/domain/value-objects/NetworkKey';
import { NetworkMother } from '../../../mothers/NetworkMother';

describe('Network', () => {
  let mother: NetworkMother;
  let primitives: PrimitiveOf<Network>;

  beforeEach(() => {
    mother = new NetworkMother();
    primitives = {
      id: mother.id.valueOf(),
      key: mother.key?.valueOf(),
      name: mother.name.valueOf(),
    };
  });

  describe('isPublic', () => {
    it('should return true when there is no key', () => {
      const network = mother.withoutKey().build();

      expect(network.isPublic()).toBe(true);
    });

    it('should return false when there is a key', () => {
      const network = mother.withPrivateKey().build();

      expect(network.isPublic()).toBe(false);
    });
  });

  describe('fromPrimitives', () => {
    it('should create a public network without key', () => {
      const network = Network.fromPrimitives(primitives);

      expect(network).toEqual(mother);
    });

    it('should create a private network with key', () => {
      const original = mother.withPrivateKey().build();
      const network = Network.fromPrimitives(original.toPrimitives());

      expect(network).toEqual(original);
    });

    it('should accept private network keys without trailing newline', () => {
      const original = mother.withPrivateKey().build();
      const primitivesWithoutTrailingNewline = {
        ...original.toPrimitives(),
        key: original.toPrimitives().key?.replace(/\n$/, ''),
      };

      const network = Network.fromPrimitives(primitivesWithoutTrailingNewline);

      expect(network.toPrimitives().key).toBe(original.toPrimitives().key);
    });
  });

  describe('key', () => {
    it('should normalize private keys with a trailing newline', () => {
      const key = mother.withPrivateKey().key as NetworkKey;
      const keyWithoutTrailingNewline = key.valueOf().replace(/\n$/, '');

      expect(new NetworkKey(keyWithoutTrailingNewline).valueOf()).toBe(
        key.valueOf(),
      );
    });
  });

  describe('toPrimitives', () => {
    it('should return undefined key for a public network', () => {
      const network = mother.withoutKey().build();

      expect(network.toPrimitives()).toEqual({ ...primitives, key: undefined });
    });

    it('should return key for a private network', () => {
      const network = mother.withPrivateKey().build();

      expect(network.toPrimitives()).toEqual({
        ...primitives,
        key: mother.key?.valueOf(),
      });
    });
  });
});
