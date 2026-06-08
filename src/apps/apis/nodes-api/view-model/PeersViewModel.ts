import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';

import { PeerResource } from '../resources/PeerResource';
import { PeersResource } from '../resources/PeersResource';

export class PeersViewModel {
  constructor(private readonly peers: NodePeer[]) {}

  private toPeerResource(peer: NodePeer): PeerResource {
    const primitives = peer.toPrimitives();
    const sharedNetworkCount = primitives.networks.length;
    const capabilities = primitives.capabilities;
    const privateIpfsAvailable =
      capabilities.privateIpfs && capabilities.privateIpfsPeerCount > 0;
    const publicIpfsAvailable =
      capabilities.publicIpfs && capabilities.publicIpfsPeerCount > 0;

    return {
      ...primitives,
      capabilities: {
        contentFallback: capabilities.contentFallback,
        gossipsub: capabilities.gossipsub,
        privateIpfs: capabilities.privateIpfs,
        publicIpfs: capabilities.publicIpfs,
        relay: capabilities.relay,
      },
      connectionSummary: {
        contentFallbackAvailable: capabilities.contentFallback,
        ipfsAvailable: privateIpfsAvailable || publicIpfsAvailable,
        isSharedNetworkPeer: sharedNetworkCount > 0,
        privateIpfsAvailable,
        privateIpfsPeerCount: capabilities.privateIpfsPeerCount,
        publicIpfsAvailable,
        publicIpfsPeerCount: capabilities.publicIpfsPeerCount,
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
