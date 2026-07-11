import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';

import { RegisteredOrbitDBNetwork } from './RegisteredOrbitDBNetwork';

export default class OrbitDBReplicatedStateRuntime {
  private readonly registeredNetworks = new Map<
    string,
    RegisteredOrbitDBNetwork
  >();

  constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly synchronizationMonitor: NodeNetworkSynchronizationMonitor,
  ) {}

  private async registerNetwork(network: IPFSNetwork): Promise<void> {
    const networkId = network.getId();

    if (this.registeredNetworks.has(networkId)) {
      return;
    }

    const stores = await OrbitDBPrivateNetworkStores.open(network);
    const localPeerId = network.getPeerId();

    this.registeredNetworks.set(networkId, {
      localPeerId,
      stores,
    });
    await this.registry.register(networkId, stores);
    this.synchronizationMonitor.observe({
      getConnectedPeerIds: () => network.getPeers(),
      id: network.getId(),
      isPrivate: network.isPrivate(),
      name: network.getName(),
      onPeerConnected: (listener) => network.onPeerConnected(listener),
      onPeerDisconnected: (listener) => network.onPeerDisconnected(listener),
      stores: stores.getSynchronizationStores().map(({ database, name }) => ({
        getPeerIds: () => [...(database.peers ?? new Set<string>())],
        name,
        onPeerJoined: (listener) => database.events.on('join', listener),
        onPeerLeft: (listener) => database.events.on('leave', listener),
      })),
      type: network.getType(),
    });
    Kernel.logger.info(
      `OrbitDB private network stores registered: networkId=${networkId}` +
        ` peerId=${localPeerId}`,
    );
  }

  public async run(): Promise<void> {
    await Promise.all(
      this.networkRegistry
        .getAll()
        .map((network) => this.registerNetwork(network)),
    );

    this.networkRegistry.onNetworkRegistered(async (network) => {
      try {
        await this.registerNetwork(network);
      } catch (error: unknown) {
        Kernel.logger.error(
          `OrbitDB replicated state network registration failed: networkId=${network.getId()} error=${String(error)}`,
        );
      }
    });
    this.networkRegistry.onNetworkRemoved(async (networkId) => {
      this.registeredNetworks.delete(networkId);
      this.synchronizationMonitor.remove(networkId);
      await this.registry.unregister(networkId);
    });
  }
}
