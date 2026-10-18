import NodeRepository from '../../domain/repositories/NodeRepository';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import { NodeOwnerAssignerMessage } from './messages/NodeOwnerAssignerMessage';

export default class NodeOwnerAssigner {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly blockPolicy: NodeBlockPolicy,
  ) {}

  public async assignOwner(message: NodeOwnerAssignerMessage): Promise<void> {
    await this.nodes.updateLocalNode((latest) =>
      latest.assignOwner(message.owner, message.authenticatedIdentityId),
    );

    await this.blockPolicy.reapply();
  }
}
