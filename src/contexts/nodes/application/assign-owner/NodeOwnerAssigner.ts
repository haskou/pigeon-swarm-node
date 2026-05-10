import NodeLoaderService from '../../domain/services/NodeLoaderService';
import NodeSaverService from '../../domain/services/NodeSaverService';
import { NodeOwnerAssignerMessage } from './messages/NodeOwnerAssignerMessage';

export default class NodeOwnerAssigner {
  constructor(
    private readonly loader: NodeLoaderService,
    private readonly saver: NodeSaverService,
  ) {}

  public async assignOwner(message: NodeOwnerAssignerMessage): Promise<void> {
    const node = await this.loader.loadNode();
    node.assignOwner(message.owner, message.authenticatedIdentityId);

    await this.saver.saveNode(node);
  }
}
