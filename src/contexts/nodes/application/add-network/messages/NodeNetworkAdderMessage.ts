import { Network } from '@app/contexts/nodes/domain/Network';

export class NodeNetworkAdderMessage {
  public readonly network: Network;
  constructor(nodeName: string, nodeKey?: string) {
    this.network = Network.fromPrimitives({
      key: nodeKey,
      name: nodeName,
    });
  }
}
