import { NodeId } from '../../../shared/domain/value-objects/NodeId';
import { Node } from '../Node';
import { NodeRegistrationMode } from '../value-objects/NodeRegistrationMode';

export default abstract class NodeRepository {
  public abstract loadLocalNodeId(): Promise<NodeId>;
  public abstract loadLocalNode(): Promise<Node>;
  public abstract loadLocalNodeRegistrationMode(): Promise<NodeRegistrationMode>;
  /**
   * Loads the latest local node, applies `change` and saves it, with no other
   * update of the local node in between, so concurrent owner writes never
   * revert each other. Nothing is saved when `change` throws. Returns the
   * changed node, its domain events still to pull.
   */
  public abstract updateLocalNode(
    change: (node: Node) => Promise<void> | void,
  ): Promise<Node>;

  /**
   * `updateLocalNode` for a stopped node, for the host commands: generates no
   * node and leaves the runtime networks alone. Throws `LocalNodeNotFoundError`
   * when no node has run on the local database.
   */
  public abstract updateStoppedLocalNode(
    change: (node: Node) => Promise<void> | void,
  ): Promise<Node>;
}
