import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { NodePeerNetwork } from './NodePeerNetwork';

export class NodePeer {
  public static fromPrimitives(primitives: PrimitiveOf<NodePeer>): NodePeer {
    return new NodePeer(
      new NodeId(primitives.id),
      primitives.owner ? new IdentityId(primitives.owner) : undefined,
      primitives.networks.map((network) =>
        NodePeerNetwork.fromPrimitives(network),
      ),
      new Timestamp(primitives.lastSeenAt),
    );
  }

  constructor(
    private readonly id: NodeId,
    private readonly owner: IdentityId | undefined,
    private readonly networks: NodePeerNetwork[],
    private readonly lastSeenAt: Timestamp,
  ) {}

  public toPrimitives() {
    return {
      id: this.id.valueOf(),
      lastSeenAt: this.lastSeenAt.valueOf(),
      networks: this.networks.map((network) => network.toPrimitives()),
      owner: this.owner?.valueOf(),
    };
  }
}
