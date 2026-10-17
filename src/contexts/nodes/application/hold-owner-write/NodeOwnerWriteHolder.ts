import NodeRepository from '../../domain/repositories/NodeRepository';
import { NodeOwnerWriteHolderMessage } from './messages/NodeOwnerWriteHolderMessage';

/**
 * Runs an owner-only write kept outside the node, such as registration codes,
 * block settings or diagnostics, while the node cannot change hands: the owner
 * is checked on the latest node and no handover lands until the write is done.
 * `write` must not update or hold the node itself, as the nested call is
 * refused at once; node settings check their owner as they change.
 */
export default class NodeOwnerWriteHolder {
  constructor(private readonly nodes: NodeRepository) {}

  public async hold<T>(
    message: NodeOwnerWriteHolderMessage,
    write: () => Promise<T>,
  ): Promise<T> {
    return this.nodes.holdLocalNode(async (node) => {
      node.assertManagedBy(message.authenticatedIdentityId);

      return write();
    });
  }
}
