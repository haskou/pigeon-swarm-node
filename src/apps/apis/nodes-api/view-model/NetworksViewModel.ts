import { Node } from '@app/contexts/nodes/domain/Node';

import { NetworksResource } from '../resources/NetworksResource';

export class NetworksViewModel {
  constructor(
    private readonly node: Node,
    private readonly disclosure: {
      exposeKeys: boolean;
      exposePrivacy: boolean;
    } = { exposeKeys: true, exposePrivacy: true },
  ) {}

  public toResource(): NetworksResource {
    const primitives = this.node.toPrimitives();

    return {
      networks: Object.values(primitives.networks).map((network) => ({
        id: network.id,
        ...(this.disclosure.exposeKeys ? { key: network.key } : {}),
        name: network.name,
        ...(this.disclosure.exposePrivacy
          ? { privateNetwork: network.key !== undefined }
          : {}),
      })),
    };
  }
}
