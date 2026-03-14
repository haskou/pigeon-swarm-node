import { Network } from '@app/contexts/nodes/domain/Network';
import { NetworkType } from '@app/contexts/nodes/domain/value-objects/NetworkType';
import { PrivateNetwork } from '@app/contexts/nodes/domain/value-objects/PrivateNetwork';
import { PublicNetwork } from '@app/contexts/nodes/domain/value-objects/PublicNetwork';

export class NodeNetworkAdderMessage {
  public readonly network: Network;
  constructor(nodeName: string, nodeType: string, nodeKey?: string) {
    const type = new NetworkType(nodeType);
    const primitives = {
      key: nodeKey,
      name: nodeName,
      type: nodeType,
    };

    if (type.isEqual(NetworkType.PRIVATE)) {
      this.network = PrivateNetwork.fromPrimitives(primitives);
    } else {
      this.network = PublicNetwork.fromPrimitives(primitives);
    }
  }
}
