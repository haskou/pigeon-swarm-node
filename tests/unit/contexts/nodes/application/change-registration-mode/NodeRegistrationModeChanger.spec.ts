import { NodeRegistrationModeChangerMessage } from '@app/contexts/nodes/application/change-registration-mode/messages/NodeRegistrationModeChangerMessage';
import NodeRegistrationModeChanger from '@app/contexts/nodes/application/change-registration-mode/NodeRegistrationModeChanger';
import { NodeRegistrationModeWasChanged } from '@app/contexts/nodes/domain/events/NodeRegistrationModeWasChanged';
import { Node } from '@app/contexts/nodes/domain/Node';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeMother } from '../../../../mothers/NodeMother';

describe('NodeRegistrationModeChanger', () => {
  let nodes: MockProxy<NodeRepository>;
  let eventPublisher: MockProxy<LocalDomainEventPublisher>;
  let changer: NodeRegistrationModeChanger;
  let node: Node;

  beforeEach(() => {
    node = new NodeMother().build();
    nodes = mock<NodeRepository>();
    nodes.updateLocalNode.mockImplementation(async (change) => {
      await change(node);

      return node;
    });
    eventPublisher = mock<LocalDomainEventPublisher>();
    changer = new NodeRegistrationModeChanger(nodes, eventPublisher);
  });

  it('should change and announce the registration mode of the latest node', async () => {
    await changer.change(new NodeRegistrationModeChangerMessage('codes'));

    expect(nodes.updateLocalNode).toHaveBeenCalledTimes(1);
    expect(node.toPrimitives().registrationMode).toBe('codes');
    expect(eventPublisher.publishLocally).toHaveBeenCalledWith([
      expect.any(NodeRegistrationModeWasChanged),
    ]);
  });

  it('should reject an unknown mode', () => {
    expect(() => new NodeRegistrationModeChangerMessage('invite')).toThrow();
  });
});
