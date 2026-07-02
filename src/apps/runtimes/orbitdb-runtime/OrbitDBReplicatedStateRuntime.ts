import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import OrbitDBDomainEventProjector from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDomainEventProjector';
import { OrbitDBEntry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBEntry';
import OrbitDBMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMetadataHeadRepairer';
import { OrbitDBReplicatedDocumentStoreName } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDocumentStoreName';
import OrbitDBReplicatedDomainEventPublisher from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDomainEventPublisher';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import { ReplicatedDomainEventMessage } from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedDomainEventMessage';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
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
    private readonly messageBus: MessageBus,
    private readonly publisher: OrbitDBReplicatedDomainEventPublisher,
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly projector: OrbitDBDomainEventProjector,
    private readonly headRepairer: OrbitDBMetadataHeadRepairer,
  ) {}

  private isReplicatedMessage(
    value: unknown,
  ): value is ReplicatedDomainEventMessage {
    return (
      typeof value === 'object' &&
      value !== null &&
      'aggregate_id' in value &&
      'attributes' in value &&
      'event_id' in value &&
      'occurred_on' in value &&
      'replication' in value &&
      'type' in value
    );
  }

  private async projectAndDispatch(
    networkId: string,
    message: ReplicatedDomainEventMessage,
  ): Promise<void> {
    const registeredNetwork = this.registeredNetworks.get(networkId);

    if (!registeredNetwork) {
      return;
    }

    if (registeredNetwork.processedEventIds.has(message.event_id)) {
      return;
    }

    registeredNetwork.processedEventIds.add(message.event_id);
    await this.projector.project(registeredNetwork.stores, message);

    if (message.replication.originPeerId === registeredNetwork.localPeerId) {
      return;
    }

    await this.messageBus.dispatchReplicated(message);
  }

  private subscribeToEvents(
    networkId: string,
    stores: OrbitDBReplicatedStateStores,
  ): void {
    stores.events.events.on('update', (entry: OrbitDBEntry) => {
      const value = entry.payload?.value;

      if (!this.isReplicatedMessage(value)) {
        return;
      }

      this.projectAndDispatch(networkId, value).catch((error: unknown) => {
        Kernel.logger.error(
          `OrbitDB replicated event dispatch failed: networkId=${networkId} error=${String(error)}`,
        );
      });
    });
  }

  private replicatedDocumentStores(
    stores: OrbitDBReplicatedStateStores,
  ): Array<{
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
      { name: 'presence', store: stores.presence },
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
    stores: OrbitDBReplicatedStateStores,
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

    const stores = await OrbitDBReplicatedStateStores.open(network);
    const localPeerId = network.getPeerId();

    this.registeredNetworks.set(networkId, {
      localPeerId,
      processedEventIds: new Set(),
      stores,
    });
    await this.registry.register(networkId, stores);
    this.publisher.registerNetworkStores(networkId, localPeerId, stores);
    this.subscribeToEvents(networkId, stores);
    this.subscribeToDocumentUpdates(networkId, stores);
    this.repairHeads(networkId);
    Kernel.logger.info(
      `OrbitDB replicated state stores registered: networkId=${networkId}` +
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
              ` notificationIndexes=${result.notificationIndexes}` +
              ` presenceHeads=${result.presenceHeads}`,
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
      this.publisher.unregisterNetworkStores(networkId);
    });

    MessageBus.setReplicatedEventPublisher(this.publisher);
  }
}
