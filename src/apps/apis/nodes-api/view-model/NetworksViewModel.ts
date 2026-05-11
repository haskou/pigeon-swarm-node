import { Node } from '@app/contexts/nodes/domain/Node';

import { NetworksResource } from '../resources/NetworksResource';

export class NetworksViewModel {
  constructor(
    private readonly node: Node,
    private readonly exposeKeys: boolean = true,
  ) {}

  public toResource(): NetworksResource {
    const primitives = this.node.toPrimitives();

    return {
      networks: Object.values(primitives.networks).map((network) => ({
        id: network.id,
        ...(this.exposeKeys ? { key: network.key } : {}),
        name: network.name,
      })),
    };
  }
}
