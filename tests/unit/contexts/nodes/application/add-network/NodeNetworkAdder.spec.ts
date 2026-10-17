import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';
import { UUID } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeNetworkAdderMessage } from '../../../../../../src/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '../../../../../../src/contexts/nodes/application/add-network/NodeNetworkAdder';
import { Node } from '../../../../../../src/contexts/nodes/domain/Node';
import NodeRepository from '../../../../../../src/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityIdMother } from '../../../../mothers/IdentityIdMother';

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
        undefined,
        IdentityIdMother.canonical().valueOf(),
      );
      const events = [mock<DomainEvent>()];

      node.pullDomainEvents.mockReturnValue(events);

      const result = await adder.addNetwork(message);

      expect(result).toBe(node);
      expect(nodes.updateLocalNode).toHaveBeenCalledTimes(1);
      expect(node.addNetwork).toHaveBeenCalledWith(
        message.network,
        message.authenticatedIdentityId,
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(events);
    });

    it('should let anyone set up a network on a node nobody claimed', async () => {
      const message = new NodeNetworkAdderMessage(
        UUID.generate().toString(),
        'private_0',
        undefined,
        undefined,
      );

      await adder.addNetwork(message);

      expect(node.addNetwork).toHaveBeenCalledWith(message.network, undefined);
    });

    it('should not publish when adding the network fails', async () => {
      const message = new NodeNetworkAdderMessage(
        UUID.generate().toString(),
        'public',
        undefined,
        undefined,
      );
      const expectedError = new Error('network constraint failed');

      node.addNetwork.mockImplementation(() => {
        throw expectedError;
      });

      await expect(adder.addNetwork(message)).rejects.toThrow(expectedError);
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('addNetwork without an id', () => {
    it('should add a network with a generated id to the latest node and publish its events', async () => {
      const message = new NodeNetworkAdderMessage(
        undefined,
        'public',
        undefined,
        IdentityIdMother.canonical().valueOf(),
      );
      const events = [mock<DomainEvent>()];

      node.pullDomainEvents.mockReturnValue(events);

      const result = await adder.addNetwork(message);

      expect(result).toBe(node);
      expect(message.network.isPublic()).toBe(true);
      expect(node.addNetwork).toHaveBeenCalledWith(
        message.network,
        message.authenticatedIdentityId,
      );
      expect(eventPublisher.publish).toHaveBeenCalledWith(events);
    });

    it('should generate a different id for every message', () => {
      const first = new NodeNetworkAdderMessage(
        undefined,
        'public',
        undefined,
        undefined,
      );
      const second = new NodeNetworkAdderMessage(
        undefined,
        'public',
        undefined,
        undefined,
      );

      expect(first.network.getId().isEqual(second.network.getId())).toBe(false);
    });
  });
});
