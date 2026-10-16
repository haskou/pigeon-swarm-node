import { NodeId } from '../../../shared/domain/value-objects/NodeId';
import { Node } from '../Node';
import { NodeRegistrationMode } from '../value-objects/NodeRegistrationMode';

export default abstract class NodeRepository {
  public abstract loadLocalNodeId(): Promise<NodeId>;
  public abstract loadLocalNode(): Promise<Node>;
  public abstract loadLocalNodeRegistrationMode(): Promise<NodeRegistrationMode>;
  public abstract saveLocalNode(node: Node): Promise<void>;
  /**
   * The local node of a stopped node, for the host commands: generates no node
   * and leaves the runtime networks alone. Throws `LocalNodeNotFoundError` when
   * no node has run on the local database.
   */
  public abstract loadStoppedLocalNode(): Promise<Node>;
  /** Saves the local node of a stopped node without starting its networks. */
  public abstract saveStoppedLocalNode(node: Node): Promise<void>;
}
