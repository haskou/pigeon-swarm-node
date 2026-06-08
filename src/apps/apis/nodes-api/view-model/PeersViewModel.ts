import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';

import { PeerResource } from '../resources/PeerResource';
import { PeersResource } from '../resources/PeersResource';

export class PeersViewModel {
  constructor(private readonly peers: NodePeer[]) {}

  private isPublicNetwork(network: { name: string }): boolean {
    return network.name === 'public';
  }

  private toPeerResource(peer: NodePeer): PeerResource {
    const primitives = peer.toPrimitives();
    const hasPublicNetwork = primitives.networks.some((network) =>
      this.isPublicNetwork(network),
    );
    const hasPrivateNetwork = primitives.networks.some(
      (network) => !this.isPublicNetwork(network),
    );
    const sharedNetworkCount = primitives.networks.length;

    return {
      ...primitives,
      capabilities: {
        gossipsub: true,
        privateIpfs: hasPrivateNetwork,
        publicIpfs: hasPublicNetwork,
        relay: false,
      },
      connectionSummary: {
        isSharedNetworkPeer: sharedNetworkCount > 0,
        sharedNetworkCount,
      },
      nodeType: 'unknown',
    };
  }

  public toResource(): PeersResource {
    return {
      peers: this.peers.map((peer) => this.toPeerResource(peer)),
    };
  }
}
