import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeNetworkRemoverMessage } from '../../../../../../src/contexts/nodes/application/remove-network/messages/NodeNetworkRemoverMessage';
import NodeNetworkRemover from '../../../../../../src/contexts/nodes/application/remove-network/NodeNetworkRemover';
import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import NodeRepository from '../../../../../../src/contexts/nodes/domain/repositories/NodeRepository';
import NodeNetworkDataCleaner from '../../../../../../src/contexts/nodes/domain/services/NodeNetworkDataCleaner';
import { IdentityIdMother } from '../../../../mothers/IdentityIdMother';

describe('NodeNetworkRemover', () => {
  let nodes: MockProxy<NodeRepository>;
  let cleaner: MockProxy<NodeNetworkDataCleaner>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let node: MockProxy<Node>;
  let remover: NodeNetworkRemover;

  beforeEach(() => {
    nodes = mock<NodeRepository>();
    cleaner = mock<NodeNetworkDataCleaner>();
    eventPublisher = mock<DomainEventPublisher>();
    node = mock<Node>();
    nodes.updateLocalNode.mockImplementation(async (change) => {
      await change(node);

      return node;
    });
    remover = new NodeNetworkRemover(nodes, cleaner, eventPublisher);
  });

  it('should remove the network from the latest node, clean its data and publish events', async () => {
    const networkId = NetworkId.generate();
    const message = new NodeNetworkRemoverMessage(
      networkId.valueOf(),
      IdentityIdMother.canonical().valueOf(),
    );
    const events = [mock<DomainEvent>()];

    node.pullDomainEvents.mockReturnValue(events);

    await remover.remove(message);

    expect(nodes.updateLocalNode).toHaveBeenCalledTimes(1);
    expect(node.removeNetwork).toHaveBeenCalledWith(
      message.networkId,
      message.authenticatedIdentityId,
    );
    expect(cleaner.clean).toHaveBeenCalledWith(message.networkId);
    expect(eventPublisher.publish).toHaveBeenCalledWith(events);
  });

  it('should not clean or publish when the domain removal fails', async () => {
    const networkId = NetworkId.generate();
    const message = new NodeNetworkRemoverMessage(
      networkId.valueOf(),
      IdentityIdMother.canonical().valueOf(),
    );
    const expectedError = new Error('network not found');

    node.removeNetwork.mockImplementation(() => {
      throw expectedError;
    });

    await expect(remover.remove(message)).rejects.toThrow(expectedError);
    expect(cleaner.clean).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('should fail the update and not publish when cleanup fails', async () => {
    const networkId = NetworkId.generate();
    const message = new NodeNetworkRemoverMessage(
      networkId.valueOf(),
      IdentityIdMother.canonical().valueOf(),
    );
    const expectedError = new Error('cleanup failed');

    cleaner.clean.mockRejectedValue(expectedError);

    await expect(remover.remove(message)).rejects.toThrow(expectedError);
    expect(node.removeNetwork).toHaveBeenCalledWith(
      message.networkId,
      message.authenticatedIdentityId,
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
