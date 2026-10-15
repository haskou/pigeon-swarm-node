import { NodeRegistrationModeChangerMessage } from '@app/contexts/nodes/application/change-registration-mode/messages/NodeRegistrationModeChangerMessage';
import NodeRegistrationModeChanger from '@app/contexts/nodes/application/change-registration-mode/NodeRegistrationModeChanger';
import { NodeRegistrationModeWasChanged } from '@app/contexts/nodes/domain/events/NodeRegistrationModeWasChanged';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import NodeSaverService from '@app/contexts/nodes/domain/services/NodeSaverService';
import { LocalDomainEventPublisher } from '@app/shared/infrastructure/messageBus/LocalDomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeMother } from '../../../../mothers/NodeMother';

describe('NodeRegistrationModeChanger', () => {
  let loader: MockProxy<NodeLoaderService>;
  let saver: MockProxy<NodeSaverService>;
  let eventPublisher: MockProxy<LocalDomainEventPublisher>;
  let changer: NodeRegistrationModeChanger;

  beforeEach(() => {
    loader = mock<NodeLoaderService>();
    saver = mock<NodeSaverService>();
    eventPublisher = mock<LocalDomainEventPublisher>();
    changer = new NodeRegistrationModeChanger(loader, saver, eventPublisher);
  });

  it('should change, save and announce the registration mode', async () => {
    const node = new NodeMother().build();

    loader.loadNode.mockResolvedValue(node);

    await changer.change(new NodeRegistrationModeChangerMessage('codes'));

    expect(node.toPrimitives().registrationMode).toBe('codes');
    expect(saver.saveNode).toHaveBeenCalledWith(node);
    expect(eventPublisher.publishLocally).toHaveBeenCalledWith([
      expect.any(NodeRegistrationModeWasChanged),
    ]);
  });

  it('should reject an unknown mode', () => {
    expect(() => new NodeRegistrationModeChangerMessage('invite')).toThrow();
  });
});
