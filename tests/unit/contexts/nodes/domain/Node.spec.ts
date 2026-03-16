import { NodeNetworkWasAdded } from '@app/contexts/nodes/domain/events/NodeNetworkWasAdded';
import { Network } from '@app/contexts/nodes/domain/Network';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NetworkName } from '@app/contexts/nodes/domain/value-objects/NetworkName';
import { faker } from '@faker-js/faker';
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
      const networkName = new NetworkName(faker.word.noun());
      const network = Network.fromPrimitives({
        key: undefined,
        name: networkName.valueOf(),
      });

      node.addNetwork(network);

      const result = node.toPrimitives();
      expect(result.networks[networkName.valueOf()]).toEqual(
        network.toPrimitives(),
      );
      expect(node.pullDomainEvents()).toEqual([
        expect.any(NodeNetworkWasAdded),
      ]);
    });

    it('should throw when adding a second public network', () => {
      const firstPublic = Network.fromPrimitives({
        key: undefined,
        name: 'public',
      });
      const secondPublic = Network.fromPrimitives({
        key: undefined,
        name: 'public_2',
      });
      node.addNetwork(firstPublic);

      expect(() => node.addNetwork(secondPublic)).toThrow(
        'A node cannot have more than one public network.',
      );
    });
  });
});
