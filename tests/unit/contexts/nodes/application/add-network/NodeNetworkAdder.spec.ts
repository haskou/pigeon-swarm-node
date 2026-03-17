import { UUID } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeNetworkAdderMessage } from '../../../../../../src/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '../../../../../../src/contexts/nodes/application/add-network/NodeNetworkAdder';
import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import NodeLoaderService from '../../../../../../src/contexts/nodes/domain/services/NodeLoaderService';
import NodeSaverService from '../../../../../../src/contexts/nodes/domain/services/NodeSaverService';
import DomainEvent from '../../../../../../src/shared/domain/events/DomainEvent';
import DomainEventPublisher from '../../../../../../src/shared/domain/events/DomainEventPublisher';

describe('NodeNetworkAdder', () => {
  let loader: MockProxy<NodeLoaderService>;
  let saver: MockProxy<NodeSaverService>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let node: MockProxy<Node>;
  let adder: NodeNetworkAdder;

  beforeEach(() => {
    loader = mock<NodeLoaderService>();
    saver = mock<NodeSaverService>();
    eventPublisher = mock<DomainEventPublisher>();
    node = mock<Node>();
    adder = new NodeNetworkAdder(loader, saver, eventPublisher);
  });

  describe('addNetwork', () => {
    it('should load node, add network, save and publish events', async () => {
      // Arrange
      const message = new NodeNetworkAdderMessage(
        UUID.generate().toString(),
        'private_0',
      );
      const events = [mock<DomainEvent>()];

      loader.loadNode.mockResolvedValue(node);
      node.pullDomainEvents.mockReturnValue(events);

      // Act
      await adder.addNetwork(message);

      // Assert
      expect(loader.loadNode).toHaveBeenCalledTimes(1);
      expect(node.addNetwork).toHaveBeenCalledWith(message.network);
      expect(saver.saveNode).toHaveBeenCalledWith(node);
      expect(eventPublisher.publish).toHaveBeenCalledWith(events);
    });

    it('should not save or publish when adding network fails', async () => {
      // Arrange
      const message = new NodeNetworkAdderMessage(
        UUID.generate().toString(),
        'public',
      );
      const expectedError = new Error('network constraint failed');

      loader.loadNode.mockResolvedValue(node);
      node.addNetwork.mockImplementation(() => {
        throw expectedError;
      });

      // Act & Assert
      await expect(adder.addNetwork(message)).rejects.toThrow(expectedError);
      expect(saver.saveNode).not.toHaveBeenCalled();
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });
});
