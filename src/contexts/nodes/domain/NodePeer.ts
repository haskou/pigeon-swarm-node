import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { Timestamp } from '@haskou/value-objects';

import type { NodePeerCapabilitiesPrimitives } from './NodePeerCapabilitiesPrimitives';
import type { NodePeerPrimitives } from './NodePeerPrimitives';

import { NodePeerCapabilities } from './NodePeerCapabilities';
import { NodePeerNetwork } from './NodePeerNetwork';

export class NodePeer {
  private readonly capabilities: NodePeerCapabilities;

  private static capabilitiesFromNetworks(
    networks: NodePeerNetwork[],
  ): NodePeerCapabilities {
    return NodePeerCapabilities.fromNetworks(networks);
  }

  public static fromPrimitives(primitives: NodePeerPrimitives): NodePeer {
    const networks = primitives.networks.map((network) =>
      NodePeerNetwork.fromPrimitives(network),
    );

    return new NodePeer(
      new NodeId(primitives.id),
      primitives.owner ? new IdentityId(primitives.owner) : undefined,
      networks,
      new Timestamp(primitives.lastSeenAt),
      NodePeerCapabilities.fromPrimitives(primitives.capabilities, networks),
    );
  }

  constructor(
    private readonly id: NodeId,
    private readonly owner: IdentityId | undefined,
    private readonly networks: NodePeerNetwork[],
    private readonly lastSeenAt: Timestamp,
    capabilities?: NodePeerCapabilities,
  ) {
    this.capabilities =
      capabilities ?? NodePeer.capabilitiesFromNetworks(networks);
  }

  public toPrimitives(): NodePeerPrimitives & {
    capabilities: NodePeerCapabilitiesPrimitives;
  } {
    return {
      capabilities: this.capabilities.toPrimitives(),
      id: this.id.valueOf(),
      lastSeenAt: this.lastSeenAt.valueOf(),
      networks: this.networks.map((network) => network.toPrimitives()),
      owner: this.owner?.valueOf(),
    };
  }
}
