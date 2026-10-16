import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import { Node } from '@app/contexts/nodes/domain/Node';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { mock, MockProxy } from 'jest-mock-extended';

import { IdentityMother } from '../../../../mothers/IdentityMother';
import { NodeMother } from '../../../../mothers/NodeMother';

describe('NodeOwnerAssigner', () => {
  let nodes: MockProxy<NodeRepository>;
  let blockPolicy: MockProxy<NodeBlockPolicy>;
  let assigner: NodeOwnerAssigner;
  let node: Node;

  beforeEach(() => {
    node = new NodeMother().build();
    nodes = mock<NodeRepository>();
    nodes.updateLocalNode.mockImplementation(async (change) => {
      await change(node);

      return node;
    });
    blockPolicy = mock<NodeBlockPolicy>();
    assigner = new NodeOwnerAssigner(nodes, blockPolicy);
  });

  it('should assign an owner to the latest local node', async () => {
    const owner = new IdentityMother().id;

    await assigner.assignOwner(
      new NodeOwnerAssignerMessage(owner.valueOf(), owner.valueOf()),
    );

    expect(nodes.updateLocalNode).toHaveBeenCalledTimes(1);
    expect(node.toPrimitives().owner).toBe(owner.valueOf());
    expect(blockPolicy.ownerChanged).toHaveBeenCalledWith(node);
  });
});
