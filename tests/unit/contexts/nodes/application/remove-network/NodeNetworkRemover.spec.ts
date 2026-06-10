import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeNetworkRemoverMessage } from '../../../../../../src/contexts/nodes/application/remove-network/messages/NodeNetworkRemoverMessage';
import NodeNetworkRemover from '../../../../../../src/contexts/nodes/application/remove-network/NodeNetworkRemover';
import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import NodeNetworkDataCleaner from '../../../../../../src/contexts/nodes/domain/services/NodeNetworkDataCleaner';
import NodeLoaderService from '../../../../../../src/contexts/nodes/domain/services/NodeLoaderService';
import NodeSaverService from '../../../../../../src/contexts/nodes/domain/services/NodeSaverService';
import DomainEvent from '../../../../../../src/shared/domain/events/DomainEvent';
import DomainEventPublisher from '../../../../../../src/shared/domain/events/DomainEventPublisher';

describe('NodeNetworkRemover', () => {
  let loader: MockProxy<NodeLoaderService>;
  let saver: MockProxy<NodeSaverService>;
  let cleaner: MockProxy<NodeNetworkDataCleaner>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let node: MockProxy<Node>;
  let remover: NodeNetworkRemover;

  beforeEach(() => {
    loader = mock<NodeLoaderService>();
    saver = mock<NodeSaverService>();
    cleaner = mock<NodeNetworkDataCleaner>();
    eventPublisher = mock<DomainEventPublisher>();
    node = mock<Node>();
    remover = new NodeNetworkRemover(loader, saver, cleaner, eventPublisher);
  });

  it('should remove a network, clean data, save and publish events', async () => {
    const networkId = NetworkId.generate();
    const message = new NodeNetworkRemoverMessage(networkId.valueOf());
    const events = [mock<DomainEvent>()];

    loader.loadNode.mockResolvedValue(node);
    node.pullDomainEvents.mockReturnValue(events);

    await remover.remove(message);

    expect(loader.loadNode).toHaveBeenCalledTimes(1);
    expect(node.removeNetwork).toHaveBeenCalledWith(message.networkId);
    expect(cleaner.clean).toHaveBeenCalledWith(message.networkId);
    expect(saver.saveNode).toHaveBeenCalledWith(node);
    expect(eventPublisher.publish).toHaveBeenCalledWith(events);
    expect(cleaner.clean.mock.invocationCallOrder[0]).toBeLessThan(
      saver.saveNode.mock.invocationCallOrder[0],
    );
  });

  it('should not save or clean when the domain removal fails', async () => {
    const networkId = NetworkId.generate();
    const message = new NodeNetworkRemoverMessage(networkId.valueOf());
    const expectedError = new Error('network not found');

    loader.loadNode.mockResolvedValue(node);
    node.removeNetwork.mockImplementation(() => {
      throw expectedError;
    });

    await expect(remover.remove(message)).rejects.toThrow(expectedError);
    expect(saver.saveNode).not.toHaveBeenCalled();
    expect(cleaner.clean).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('should not save or publish events when cleanup fails', async () => {
    const networkId = NetworkId.generate();
    const message = new NodeNetworkRemoverMessage(networkId.valueOf());
    const expectedError = new Error('cleanup failed');

    loader.loadNode.mockResolvedValue(node);
    cleaner.clean.mockRejectedValue(expectedError);

    await expect(remover.remove(message)).rejects.toThrow(expectedError);
    expect(node.removeNetwork).toHaveBeenCalledWith(message.networkId);
    expect(saver.saveNode).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
