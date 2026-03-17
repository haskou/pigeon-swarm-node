import { NodeCannotHaveMoreThanOnePublicNetworkError } from '@app/contexts/nodes/domain/errors/NodeCannotHaveMoreThanOnePublicNetworkError';
import { NodeNetworkWasAdded } from '@app/contexts/nodes/domain/events/NodeNetworkWasAdded';
import { Network } from '@app/contexts/nodes/domain/Network';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { PrimitiveOf } from '@haskou/value-objects';

import { NodeMother } from '../../../mothers/NodeMother';

describe('Node', () => {
  let mother: NodeMother;
  let node: Node;
  let primitives: PrimitiveOf<Node>;

  beforeEach(() => {
    mother = new NodeMother();
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
      const network = Network.fromPrimitives({
        id: networkId.valueOf(),
        key: undefined,
        name: 'public',
      });

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
      const firstPublic = Network.fromPrimitives({
        id: '550e8400-e29b-41d4-a716-446655440000',
        key: undefined,
        name: 'public',
      });
      const secondPublic = Network.fromPrimitives({
        id: '550e8400-e29b-41d4-a716-446655440001',
        key: undefined,
        name: 'public_2',
      });
      node.addNetwork(firstPublic);

      expect(() => node.addNetwork(secondPublic)).toThrow(
        NodeCannotHaveMoreThanOnePublicNetworkError,
      );
    });
  });
});
