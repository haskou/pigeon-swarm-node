import { Node } from '../../domain/Node';
import NodeLoaderService from '../../domain/services/NodeLoaderService';

export default class NodeLoader {
  constructor(private readonly nodeLoaderService: NodeLoaderService) {}

  public async loadNode(): Promise<Node> {
    return await this.nodeLoaderService.loadNode();
  }
}
