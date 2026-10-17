import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { NodeId } from '../../../shared/domain/value-objects/NodeId';
import { Node } from '../Node';
import { NodeRegistrationMode } from '../value-objects/NodeRegistrationMode';

export default abstract class NodeRepository {
  public abstract loadLocalNodeId(): Promise<NodeId>;
  public abstract loadLocalNode(): Promise<Node>;
  public abstract loadLocalNodeRegistrationMode(): Promise<NodeRegistrationMode>;
  /**
   * Whether the identity owns the local node as it is stored, read without
   * syncing the runtime networks so it is cheap enough to ask per request.
   */
  public abstract isLocalNodeOwnedBy(identityId: IdentityId): Promise<boolean>;
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

  /**
   * Runs `action` with the latest local node while no update of the local node,
   * owner changes included, can happen, so a write `action` stores elsewhere
   * after checking the node still holds when it lands. `action` must not
   * update the local node, and a hold is taken before a block policy change,
   * never inside one, so the two always queue in the same order.
   */
  public abstract holdLocalNode<T>(
    action: (node: Node) => Promise<T>,
  ): Promise<T>;
}
