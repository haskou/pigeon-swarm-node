import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import Kernel from '@app/Kernel';

export class NodeRuntime {
  private readonly nodeLoader: NodeLoader = Kernel.di.getService(NodeLoader);
  constructor() {}

  public async run(): Promise<void> {
    await this.nodeLoader.loadNode();
  }
}
