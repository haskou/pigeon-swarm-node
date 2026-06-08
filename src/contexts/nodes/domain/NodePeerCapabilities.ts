import type { NodePeerCapabilitiesPrimitives } from './NodePeerCapabilitiesPrimitives';

import { NodePeerNetwork } from './NodePeerNetwork';

export class NodePeerCapabilities {
  public static fromNetworks(
    networks: NodePeerNetwork[],
  ): NodePeerCapabilities {
    const primitives = networks.map((network) => network.toPrimitives());
    const hasPublicNetwork = primitives.some(
      (network) => network.name === 'public',
    );
    const hasPrivateNetwork = primitives.some(
      (network) => network.name !== 'public',
    );

    return new NodePeerCapabilities(
      true,
      hasPrivateNetwork,
      hasPublicNetwork,
      false,
      false,
      0,
      0,
    );
  }

  public static fromPrimitives(
    primitives: Partial<NodePeerCapabilitiesPrimitives> | undefined,
    networks: NodePeerNetwork[],
  ): NodePeerCapabilities {
    const inferred = NodePeerCapabilities.fromNetworks(networks).toPrimitives();

    return new NodePeerCapabilities(
      primitives?.gossipsub ?? inferred.gossipsub,
      primitives?.privateIpfs ?? inferred.privateIpfs,
      primitives?.publicIpfs ?? inferred.publicIpfs,
      primitives?.relay ?? inferred.relay,
      primitives?.contentFallback ?? inferred.contentFallback,
      primitives?.privateIpfsPeerCount ?? inferred.privateIpfsPeerCount,
      primitives?.publicIpfsPeerCount ?? inferred.publicIpfsPeerCount,
    );
  }

  public constructor(
    private readonly gossipsub: boolean,
    private readonly privateIpfs: boolean,
    private readonly publicIpfs: boolean,
    private readonly relay: boolean,
    private readonly contentFallback: boolean,
    private readonly privateIpfsPeerCount: number,
    private readonly publicIpfsPeerCount: number,
  ) {}

  public toPrimitives(): NodePeerCapabilitiesPrimitives {
    return {
      contentFallback: this.contentFallback,
      gossipsub: this.gossipsub,
      privateIpfs: this.privateIpfs,
      privateIpfsPeerCount: this.privateIpfsPeerCount,
      publicIpfs: this.publicIpfs,
      publicIpfsPeerCount: this.publicIpfsPeerCount,
      relay: this.relay,
    };
  }
}
