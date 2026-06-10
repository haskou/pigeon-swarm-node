import { NodeId } from '../../../shared/domain/value-objects/NodeId';
import { Node } from '../Node';

export default abstract class NodeRepository {
  public abstract loadLocalNodeId(): Promise<NodeId>;
  public abstract loadLocalNode(): Promise<Node>;
  public abstract saveLocalNode(node: Node): Promise<void>;
}
