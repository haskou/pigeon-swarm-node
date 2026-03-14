import { Node } from '../Node';
import { NodeRepository } from '../repositories/NodeRepository';

export class NodeSaverService {
  constructor(private readonly repository: NodeRepository) {}

  public async saveNode(node: Node): Promise<void> {
    await this.repository.saveLocalNode(node);
  }
}
