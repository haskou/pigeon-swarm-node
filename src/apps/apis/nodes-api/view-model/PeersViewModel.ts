import { ActiveNodePeers } from '@app/contexts/nodes/application/find-peers/ActiveNodePeers';
import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import { NodePeerNetworkType } from '@app/contexts/nodes/domain/value-objects/NodePeerNetworkType';

import { ConnectedIpfsPeerResource } from '../resources/ConnectedIpfsPeerResource';
import { PeerCapabilitiesResource } from '../resources/PeerCapabilitiesResource';
import { PeerConnectionSummaryResource } from '../resources/PeerConnectionSummaryResource';
import { PeerNetworkResource } from '../resources/PeerNetworkResource';
import { PeerNodeTypeResource } from '../resources/PeerNodeTypeResource';
import { PeerResource } from '../resources/PeerResource';
import { PeersResource } from '../resources/PeersResource';

export class PeersViewModel {
  public constructor(
    private readonly activePeers: ActiveNodePeers,
    private readonly connectedIpfsPeers: ConnectedIpfsPeerResource[] = [],
  ) {}

  private capabilitiesFor(
    localNetworkTypes: Map<string, string>,
    networks: Array<{ id: string; name: string; type?: string }>,
  ): PeerCapabilitiesResource {
    const networkTypes = networks.map(
      (network) => network.type ?? localNetworkTypes.get(network.id),
    );
    const publicIpfs = networkTypes.some(
      (networkType) => networkType === NodePeerNetworkType.PUBLIC,
    );
    const privateIpfs = networkTypes.some(
      (networkType) => networkType === NodePeerNetworkType.PRIVATE,
    );

    return {
      privateIpfs,
      publicIpfs,
      relay: privateIpfs && publicIpfs,
    };
  }

  private connectionSummaryFor(
    localNetworkIds: Set<string>,
    networks: Array<{ id: string }>,
  ): PeerConnectionSummaryResource {
    const sharedNetworkCount = networks.filter((network) =>
      localNetworkIds.has(network.id),
    ).length;

    return {
      isSharedNetworkPeer: sharedNetworkCount > 0,
      sharedNetworkCount,
    };
  }

  private nodeTypeFor(
    capabilities: PeerCapabilitiesResource,
  ): PeerNodeTypeResource {
    if (capabilities.relay) {
      return 'relay';
    }

    if (capabilities.publicIpfs) {
      return 'reachable';
    }

    if (capabilities.privateIpfs) {
      return 'leaf';
    }

    return 'unknown';
  }

  private networksFor(
    networks: Array<{ id: string; name: string }>,
  ): PeerNetworkResource[] {
    return networks.map((network) => ({
      id: network.id,
      name: network.name,
    }));
  }

  private peerResource(
    localNetworkTypes: Map<string, string>,
    localNetworkIds: Set<string>,
    peer: NodePeer,
  ): PeerResource {
    const primitives = peer.toPrimitives();
    const capabilities = this.capabilitiesFor(
      localNetworkTypes,
      primitives.networks,
    );

    return {
      capabilities,
      connectionSummary: this.connectionSummaryFor(
        localNetworkIds,
        primitives.networks,
      ),
      id: primitives.id,
      lastSeenAt: primitives.lastSeenAt,
      networks: this.networksFor(primitives.networks),
      nodeType: this.nodeTypeFor(capabilities),
      ...(primitives.owner ? { owner: primitives.owner } : {}),
    };
  }

  public toResource(): PeersResource {
    const localNode = this.activePeers.getLocalNode().toPrimitives();
    const localNetworkIds = new Set(Object.keys(localNode.networks));
    const localNetworkTypes = new Map(
      Object.values(localNode.networks).map((network) => [
        network.id,
        network.key ? NodePeerNetworkType.PRIVATE : NodePeerNetworkType.PUBLIC,
      ]),
    );

    return {
      ipfsPeers: this.connectedIpfsPeers,
      peers: this.activePeers
        .getPeers()
        .map((peer) =>
          this.peerResource(localNetworkTypes, localNetworkIds, peer),
        ),
    };
  }
}
