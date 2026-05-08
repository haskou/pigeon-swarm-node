import { NodeCannotHaveMoreThanOnePublicNetworkError } from '@app/contexts/nodes/domain/errors/NodeCannotHaveMoreThanOnePublicNetworkError';
import { NodeOwnerAlreadyAssignedError } from '@app/contexts/nodes/domain/errors/NodeOwnerAlreadyAssignedError';
import { NodeNetworkWasAdded } from '@app/contexts/nodes/domain/events/NodeNetworkWasAdded';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';

import { IdentityMother } from '../../../mothers/IdentityMother';
import { NetworkMother } from '../../../mothers/NetworkMother';
import { NodeMother } from '../../../mothers/NodeMother';

describe('Node', () => {
  let mother: NodeMother;
  let networkMother: NetworkMother;
  let node: Node;
  let primitives: PrimitiveOf<Node>;

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

  describe('assignOwner', () => {
    it('should assign the node owner', () => {
      const owner = new IdentityMother().id;

      node.assignOwner(owner);

      expect(node.toPrimitives().owner).toBe(owner.valueOf());
    });

    it('should reject assigning the node owner twice', () => {
      const owner = new IdentityMother().id;

      node.assignOwner(owner);

      expect(() => node.assignOwner(owner)).toThrow(
        NodeOwnerAlreadyAssignedError,
      );
    });
  });
});
