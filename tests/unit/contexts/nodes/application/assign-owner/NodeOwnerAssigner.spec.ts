import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import NodeSaverService from '@app/contexts/nodes/domain/services/NodeSaverService';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { NodeMother } from '../../../../mothers/NodeMother';

describe('NodeOwnerAssigner', () => {
  let loader: MockProxy<NodeLoaderService>;
  let saver: MockProxy<NodeSaverService>;
  let blockPolicy: MockProxy<NodeBlockPolicy>;
  let assigner: NodeOwnerAssigner;

  beforeEach(() => {
    loader = mock<NodeLoaderService>();
    saver = mock<NodeSaverService>();
    blockPolicy = mock<NodeBlockPolicy>();
    assigner = new NodeOwnerAssigner(loader, saver, blockPolicy);
  });

  it('should assign an owner to the local node', async () => {
    const node = new NodeMother().build();
    const owner = new IdentityMother().id;

    loader.loadNode.mockResolvedValue(node);

    await assigner.assignOwner(
      new NodeOwnerAssignerMessage(owner.valueOf(), owner.valueOf()),
    );

    expect(saver.saveNode).toHaveBeenCalledWith(node);
    expect(node.toPrimitives().owner).toBe(owner.valueOf());
    expect(blockPolicy.ownerChanged).toHaveBeenCalledWith(node);
  });
});
