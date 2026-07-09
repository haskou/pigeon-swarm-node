import NodeNetworkSynchronizationMonitor from '@app/contexts/nodes/application/find-network-synchronization/NodeNetworkSynchronizationMonitor';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import OrbitDBMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMetadataHeadRepairer';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import { OrbitDBReplicatedDocumentStoreName } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDocumentStoreName';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';

import { RegisteredOrbitDBNetwork } from './RegisteredOrbitDBNetwork';

export default class OrbitDBReplicatedStateRuntime {
  private static readonly criticalRepairDelayMs = 1_000;

  private static readonly documentUpdateRepairCooldownMs = 15 * 60_000;

  private static readonly documentUpdateRepairDelayMs = 30_000;

  private static readonly secondaryRepairDelayMs = 120_000;

  private readonly registeredNetworks = new Map<
    string,
    RegisteredOrbitDBNetwork
  >();

  private readonly scheduledCriticalRepairNetworkIds = new Set<string>();

  private readonly repairingCriticalNetworkIds = new Set<string>();

  private readonly repairingSecondaryNetworkIds = new Set<string>();

  private readonly scheduledDocumentUpdateRepairTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private readonly repairingDocumentUpdateKeys = new Set<string>();

  private readonly lastDocumentUpdateRepairAt = new Map<string, number>();

  constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly headRepairer: OrbitDBMetadataHeadRepairer,
    private readonly synchronizationMonitor: NodeNetworkSynchronizationMonitor,
  ) {}

  private replicatedDocumentStores(stores: OrbitDBPrivateNetworkStores): Array<{
    name: OrbitDBReplicatedDocumentStoreName;
    store: OrbitDBDatabase | undefined;
  }> {
    return [
      { name: 'calls', store: stores.calls },
      { name: 'communities', store: stores.communities },
      { name: 'contentReplication', store: stores.contentReplication },
      { name: 'conversations', store: stores.conversations },
      { name: 'identities', store: stores.identities },
      { name: 'keychains', store: stores.keychains },
      { name: 'messages', store: stores.messages },
      { name: 'moderationLogs', store: stores.moderationLogs },
      { name: 'notifications', store: stores.notifications },
      { name: 'notificationSettings', store: stores.notificationSettings },
      { name: 'pins', store: stores.pins },
      { name: 'polls', store: stores.polls },
      { name: 'reactions', store: stores.reactions },
      { name: 'requests', store: stores.requests },
      { name: 'stickerPacks', store: stores.stickerPacks },
      { name: 'stickerUserLibraries', store: stores.stickerUserLibraries },
    ];
  }

  private documentUpdateRepairKey(
    networkId: string,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): string {
    return `${networkId}:${storeName}`;
  }

  private documentUpdateRepairDelayFor(repairKey: string): number {
    const lastRepairAt = this.lastDocumentUpdateRepairAt.get(repairKey) || 0;
    const elapsedMs = Date.now() - lastRepairAt;
    const cooldownRemainingMs = Math.max(
      0,
      OrbitDBReplicatedStateRuntime.documentUpdateRepairCooldownMs - elapsedMs,
    );

    return Math.max(
      OrbitDBReplicatedStateRuntime.documentUpdateRepairDelayMs,
      cooldownRemainingMs,
    );
  }

  private repairDocumentStoreHeads(
    networkId: string,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): void {
    const repairKey = this.documentUpdateRepairKey(networkId, storeName);

    if (
      this.scheduledCriticalRepairNetworkIds.has(networkId) ||
      this.repairingCriticalNetworkIds.has(networkId) ||
      this.repairingDocumentUpdateKeys.has(repairKey)
    ) {
      return;
    }

    this.repairingDocumentUpdateKeys.add(repairKey);
    this.headRepairer
      .repairStore(storeName)
      .then((result) => {
        Kernel.logger.debug(
          `OrbitDB document update read indexes repaired: networkId=${networkId}` +
            ` store=${storeName}` +
            ` result=${JSON.stringify(result)}`,
        );
      })
      .catch((error: unknown) => {
        Kernel.logger.warn(
          `OrbitDB document update read index repair failed: networkId=${networkId}` +
            ` store=${storeName}` +
            ` error=${String(error)}`,
        );
      })
      .finally(() => {
        this.lastDocumentUpdateRepairAt.set(repairKey, Date.now());
        this.repairingDocumentUpdateKeys.delete(repairKey);
      });
  }

  private scheduleDocumentStoreHeadRepair(
    networkId: string,
    storeName: OrbitDBReplicatedDocumentStoreName,
  ): void {
    const repairKey = this.documentUpdateRepairKey(networkId, storeName);

    if (this.scheduledDocumentUpdateRepairTimeouts.has(repairKey)) {
      return;
    }

    const timeout = setTimeout(() => {
      this.scheduledDocumentUpdateRepairTimeouts.delete(repairKey);
      this.repairDocumentStoreHeads(networkId, storeName);
    }, this.documentUpdateRepairDelayFor(repairKey));

    timeout.unref?.();
    this.scheduledDocumentUpdateRepairTimeouts.set(repairKey, timeout);
  }

  private subscribeToDocumentUpdates(
    networkId: string,
    stores: OrbitDBPrivateNetworkStores,
  ): void {
    for (const { name, store } of this.replicatedDocumentStores(stores)) {
      store?.events?.on?.('update', () => {
        Kernel.logger.debug?.(
          `OrbitDB replicated document update: networkId=${networkId}` +
            ` store=${name}`,
        );
        this.scheduleDocumentStoreHeadRepair(networkId, name);
      });
    }
  }

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
    this.subscribeToDocumentUpdates(networkId, stores);
    this.repairHeads(networkId);
    Kernel.logger.info(
      `OrbitDB private network stores registered: networkId=${networkId}` +
        ` peerId=${localPeerId}`,
    );
  }

  private repairHeads(networkId: string): void {
    if (
      this.scheduledCriticalRepairNetworkIds.has(networkId) ||
      this.repairingCriticalNetworkIds.has(networkId)
    ) {
      return;
    }

    this.scheduledCriticalRepairNetworkIds.add(networkId);
    const timeout = setTimeout(() => {
      this.scheduledCriticalRepairNetworkIds.delete(networkId);
      this.repairingCriticalNetworkIds.add(networkId);
      this.headRepairer
        .repairCritical()
        .then((result) => {
          Kernel.logger.debug(
            `OrbitDB critical read indexes repaired: networkId=${networkId}` +
              ` identities=${result.identities}` +
              ` keychains=${result.keychains}` +
              ` communities=${result.communities}` +
              ` conversations=${result.conversations}` +
              ` notificationIndexes=${result.notificationIndexes}`,
          );
          this.repairSecondaryHeads(networkId);
        })
        .catch((error: unknown) => {
          Kernel.logger.warn(
            `OrbitDB critical read index repair failed: networkId=${networkId} error=${String(error)}`,
          );
        })
        .finally(() => {
          this.repairingCriticalNetworkIds.delete(networkId);
        });
    }, OrbitDBReplicatedStateRuntime.criticalRepairDelayMs);
    timeout.unref?.();
  }

  private repairSecondaryHeads(networkId: string): void {
    if (this.repairingSecondaryNetworkIds.has(networkId)) {
      return;
    }

    this.repairingSecondaryNetworkIds.add(networkId);
    const timeout = setTimeout(() => {
      this.headRepairer
        .repairSecondary()
        .then((result) => {
          Kernel.logger.debug(
            `OrbitDB secondary read indexes repaired: networkId=${networkId}` +
              ` conversationMessageIndexes=${result.conversationMessageIndexes}` +
              ` communityChannelMessageIndexes=${result.communityChannelMessageIndexes}` +
              ` reactionIndexes=${result.reactionIndexes}` +
              ` pollIndexes=${result.pollIndexes}` +
              ` callIndexes=${result.callIndexes}`,
          );
        })
        .catch((error: unknown) => {
          Kernel.logger.warn(
            `OrbitDB secondary read index repair failed: networkId=${networkId} error=${String(error)}`,
          );
        })
        .finally(() => {
          this.repairingSecondaryNetworkIds.delete(networkId);
        });
    }, OrbitDBReplicatedStateRuntime.secondaryRepairDelayMs);
    timeout.unref?.();
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
      for (const [repairKey, timeout] of [
        ...this.scheduledDocumentUpdateRepairTimeouts.entries(),
      ]) {
        if (!repairKey.startsWith(`${networkId}:`)) {
          continue;
        }

        clearTimeout(timeout);
        this.scheduledDocumentUpdateRepairTimeouts.delete(repairKey);
        this.repairingDocumentUpdateKeys.delete(repairKey);
        this.lastDocumentUpdateRepairAt.delete(repairKey);
      }
      await this.registry.unregister(networkId);
    });
  }
}
