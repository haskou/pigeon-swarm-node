import { NodeBlocks } from '../../domain/NodeBlocks';
import NodeBlockListRepository from '../../domain/repositories/NodeBlockListRepository';

export default class NodeBlockListFinder {
  constructor(private readonly repository: NodeBlockListRepository) {}

  public async find(): Promise<NodeBlocks> {
    return this.repository.findLocal();
  }
}
