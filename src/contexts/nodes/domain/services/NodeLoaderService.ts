import { Node } from '../Node';
import { NodeRepository } from '../repositories/NodeRepository';

export default class NodeLoaderService {
  constructor(private readonly repository: NodeRepository) {}

  public async loadNode(): Promise<Node> {
    return await this.repository.loadLocalNode();
  }
}
