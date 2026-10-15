import { NodeId } from '../../../shared/domain/value-objects/NodeId';
import { Node } from '../Node';
import { NodeRegistrationMode } from '../value-objects/NodeRegistrationMode';
import NodeOwnerSettingsReset from './NodeOwnerSettingsReset';

/** Resetting its owner settings forgets the owner and opens registration. */
export default abstract class NodeRepository extends NodeOwnerSettingsReset {
  public abstract loadLocalNodeId(): Promise<NodeId>;
  public abstract loadLocalNode(): Promise<Node>;
  public abstract loadLocalNodeRegistrationMode(): Promise<NodeRegistrationMode>;
  public abstract saveLocalNode(node: Node): Promise<void>;
}
