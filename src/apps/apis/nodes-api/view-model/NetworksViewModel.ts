import { Node } from '@app/contexts/nodes/domain/Node';

import { NetworksResource } from '../resources/NetworksResource';

export class NetworksViewModel {
  /**
   * `disclosure` has no default: every route decides who may see network keys
   * and the private-network flag, so a new route never discloses them by
   * omission.
   */
  constructor(
    private readonly node: Node,
    private readonly disclosure: {
      exposeKeys: boolean;
      exposePrivacy: boolean;
    },
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
