import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PublicRelayRuntime } from '@app/shared/infrastructure/network/relay/PublicRelayRuntime';

import type { NodeHeartbeatCapabilitiesProvider as CapabilitiesProvider } from '../../application/send-heartbeat/NodeHeartbeatCapabilitiesProvider';
import type { NodePeerCapabilitiesPrimitives } from '../../domain/NodePeerCapabilitiesPrimitives';

export class NodeRuntimeCapabilitiesProvider implements CapabilitiesProvider {
  public constructor(
    private readonly networkRegistry = new IPFSNetworkRegistry(),
  ) {}

  private uniquePeerCount(peers: string[]): number {
    return new Set(peers).size;
  }

  public async find(): Promise<NodePeerCapabilitiesPrimitives> {
    await this.networkRegistry.initialize();

    const networks = this.networkRegistry.getAll();
    const privateNetworks = networks.filter((network) => network.isPrivate());
    const publicNetworks = networks.filter((network) => !network.isPrivate());
    const relayState = new PublicRelayRuntime(
      this.networkRegistry,
    ).debugState();

    return {
      contentFallback: false,
      gossipsub: true,
      privateIpfs: privateNetworks.length > 0,
      privateIpfsPeerCount: this.uniquePeerCount(
        privateNetworks.flatMap((network) => network.getPeers()),
      ),
      publicIpfs: publicNetworks.length > 0,
      publicIpfsPeerCount: this.uniquePeerCount(
        publicNetworks.flatMap((network) => network.getPeers()),
      ),
      relay: relayState.running,
    };
  }
}
