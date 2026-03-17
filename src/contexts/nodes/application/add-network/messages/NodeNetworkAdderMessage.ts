import { Network } from '@app/contexts/nodes/domain/Network';

export class NodeNetworkAdderMessage {
  public readonly network: Network;
  constructor(id: string, name: string, key?: string) {
    this.network = Network.fromPrimitives({
      id,
      key,
      name,
    });
  }
}
