import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { NodePeerNetworkPrimitives } from './NodePeerNetworkPrimitives';
import { NetworkName } from './value-objects/NetworkName';
import { NodePeerNetworkType } from './value-objects/NodePeerNetworkType';

export class NodePeerNetwork {
  public static fromPrimitives(
    primitives: NodePeerNetworkPrimitives,
  ): NodePeerNetwork {
    const name = new NetworkName(primitives.name);

    return new NodePeerNetwork(
      new NetworkId(primitives.id),
      name,
      primitives.type ? new NodePeerNetworkType(primitives.type) : undefined,
    );
  }

  constructor(
    private readonly id: NetworkId,
    private readonly name: NetworkName,
    private readonly type?: NodePeerNetworkType,
  ) {}

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      name: this.name.valueOf(),
      ...(this.type ? { type: this.type.valueOf() } : {}),
    };
  }
}
