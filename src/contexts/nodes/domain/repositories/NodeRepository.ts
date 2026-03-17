import { Node } from '../Node';

export interface NodeRepository {
  loadLocalNode(): Promise<Node>;
  saveLocalNode(node: Node): Promise<void>;
}
