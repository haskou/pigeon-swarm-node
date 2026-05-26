import { NodeCannotHaveMoreThanOnePublicNetworkError } from '@app/contexts/nodes/domain/errors/NodeCannotHaveMoreThanOnePublicNetworkError';
import { NodeNetworkNotFoundError } from '@app/contexts/nodes/domain/errors/NodeNetworkNotFoundError';
import { NodeOwnerCanOnlyBeChangedByCurrentOwnerError } from '@app/contexts/nodes/domain/errors/NodeOwnerCanOnlyBeChangedByCurrentOwnerError';
import { NodeNetworkWasAdded } from '@app/contexts/nodes/domain/events/NodeNetworkWasAdded';
import { NodeNetworkWasRemoved } from '@app/contexts/nodes/domain/events/NodeNetworkWasRemoved';
import { Node } from '@app/contexts/nodes/domain/Node';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';

import { IdentityMother } from '../../../mothers/IdentityMother';
import { NetworkMother } from '../../../mothers/NetworkMother';
import { NodeMother } from '../../../mothers/NodeMother';

describe('Node', () => {
  let mother: NodeMother;
  let networkMother: NetworkMother;
  let node: Node;
  let primitives: PrimitiveOf<Node>;

  const generateIdentityId = (): IdentityId => {
    const { publicKey } = generateKeyPairSync('ed25519');

    return new IdentityId(
      publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    );
  };

  beforeEach(() => {
    mother = new NodeMother();
    networkMother = new NetworkMother();
    node = mother.build();
    primitives = {
      id: mother.id.valueOf(),
      networks: Object.fromEntries(
        Array.from(mother.networks.entries()).map(([key, network]) => [
          key.valueOf(),
          network.toPrimitives(),
        ]),
      ),
      owner: mother.owner?.valueOf(),
    };
  });

  describe('fromPrimitives', () => {
    it('should create a node from primitives', () => {
      const created = Node.fromPrimitives(primitives);

      expect(created.toPrimitives()).toEqual(primitives);
    });
  });

  describe('toPrimitives', () => {
    it('should return the correct primitives', () => {
      const result = node.toPrimitives();

      expect(result).toEqual(primitives);
    });
  });

  describe('addNetwork', () => {
    it('should add a network and record a NodeNetworkWasAdded event', () => {
      const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440000');
      const network = networkMother.withId(networkId).withoutKey().build();

      node.addNetwork(network);

      const result = node.toPrimitives();
      expect(result.networks[networkId.valueOf()]).toEqual(
        network.toPrimitives(),
      );
      expect(node.pullDomainEvents()).toEqual([
        expect.any(NodeNetworkWasAdded),
      ]);
    });

    it('should throw when adding a second public network', () => {
      const firstPublic = networkMother
        .withId(NetworkId.generate())
        .withoutKey()
        .build();
      const secondPublic = new NetworkMother()
        .withId(NetworkId.generate())
        .withoutKey()
        .build();

      node.addNetwork(firstPublic);

      expect(() => node.addNetwork(secondPublic)).toThrow(
        NodeCannotHaveMoreThanOnePublicNetworkError,
      );
    });
  });

  describe('removeNetwork', () => {
    it('should remove a network and record a NodeNetworkWasRemoved event', () => {
      const networkId = NetworkId.generate();
      const network = networkMother.withId(networkId).withoutKey().build();

      node.addNetwork(network);
      node.pullDomainEvents();
      node.removeNetwork(networkId);

      expect(node.toPrimitives().networks[networkId.valueOf()]).toBeUndefined();
      expect(node.pullDomainEvents()).toEqual([
        expect.any(NodeNetworkWasRemoved),
      ]);
    });

    it('should remove a network even when the map key is a different value object instance', () => {
      const networkId = NetworkId.generate();
      const network = networkMother.withId(networkId).withoutKey().build();
      const restored = Node.fromPrimitives({
        id: mother.id.valueOf(),
        networks: {
          [networkId.valueOf()]: network.toPrimitives(),
        },
        owner: undefined,
      });

      restored.removeNetwork(new NetworkId(networkId.valueOf()));

      expect(restored.toPrimitives().networks).toEqual({});
    });

    it('should throw when removing an unknown network', () => {
      expect(() => node.removeNetwork(NetworkId.generate())).toThrow(
        NodeNetworkNotFoundError,
      );
    });
  });

  describe('assignOwner', () => {
    it('should assign the node owner', () => {
      const owner = new IdentityMother().id;

      node.assignOwner(owner, owner);

      expect(node.toPrimitives().owner).toBe(owner.valueOf());
    });

    it('should allow the current owner to change the node owner', () => {
      const owner = new IdentityMother().id;
      const nextOwner = generateIdentityId();

      node.assignOwner(owner, owner);
      node.assignOwner(nextOwner, owner);

      expect(node.toPrimitives().owner).toBe(nextOwner.valueOf());
    });

    it('should reject changing the node owner by another identity', () => {
      const owner = new IdentityMother().id;
      const anotherIdentity = generateIdentityId();
      const nextOwner = generateIdentityId();

      node.assignOwner(owner, owner);

      expect(() => node.assignOwner(nextOwner, anotherIdentity)).toThrow(
        NodeOwnerCanOnlyBeChangedByCurrentOwnerError,
      );
    });
  });
});
