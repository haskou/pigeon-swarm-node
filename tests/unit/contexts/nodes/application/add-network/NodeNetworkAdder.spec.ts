import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { UUID } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeNetworkAdderMessage } from '../../../../../../src/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import { NodePublicNetworkAdderMessage } from '../../../../../../src/contexts/nodes/application/add-network/messages/NodePublicNetworkAdderMessage';
import NodeNetworkAdder from '../../../../../../src/contexts/nodes/application/add-network/NodeNetworkAdder';
import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import NodeRepository from '../../../../../../src/contexts/nodes/domain/repositories/NodeRepository';

describe('NodeNetworkAdder', () => {
  let nodes: MockProxy<NodeRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let node: MockProxy<Node>;
  let adder: NodeNetworkAdder;

  beforeEach(() => {
    nodes = mock<NodeRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    node = mock<Node>();
    nodes.updateLocalNode.mockImplementation(async (change) => {
      await change(node);

      return node;
    });
    adder = new NodeNetworkAdder(nodes, eventPublisher);
  });

  describe('addNetwork', () => {
    it('should add the network to the latest node and publish its events', async () => {
      const message = new NodeNetworkAdderMessage(
        UUID.generate().toString(),
        'private_0',
      );
      const events = [mock<DomainEvent>()];

      node.pullDomainEvents.mockReturnValue(events);

      const result = await adder.addNetwork(message);

      expect(result).toBe(node);
      expect(nodes.updateLocalNode).toHaveBeenCalledTimes(1);
      expect(node.addNetwork).toHaveBeenCalledWith(message.network);
      expect(eventPublisher.publish).toHaveBeenCalledWith(events);
    });

    it('should not publish when adding the network fails', async () => {
      const message = new NodeNetworkAdderMessage(
        UUID.generate().toString(),
        'public',
      );
      const expectedError = new Error('network constraint failed');

      node.addNetwork.mockImplementation(() => {
        throw expectedError;
      });

      await expect(adder.addNetwork(message)).rejects.toThrow(expectedError);
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('addPublicNetwork', () => {
    it('should add a generated public network to the latest node and publish its events', async () => {
      const message = new NodePublicNetworkAdderMessage();
      const events = [mock<DomainEvent>()];

      node.pullDomainEvents.mockReturnValue(events);

      const result = await adder.addPublicNetwork(message);

      expect(result).toBe(node);
      expect(node.addNetwork).toHaveBeenCalledWith(message.network);
      expect(eventPublisher.publish).toHaveBeenCalledWith(events);
    });
  });
});
