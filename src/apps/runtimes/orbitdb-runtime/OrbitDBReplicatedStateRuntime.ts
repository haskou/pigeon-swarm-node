import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import OrbitDBDomainEventProjector from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDomainEventProjector';
import { OrbitDBEntry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBEntry';
import OrbitDBMetadataHeadRepairer from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMetadataHeadRepairer';
import OrbitDBReplicatedDomainEventPublisher from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedDomainEventPublisher';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBReplicatedStateStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateStores';
import { ReplicatedDomainEventMessage } from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedDomainEventMessage';
import Kernel from '@app/Kernel';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';

import { RegisteredOrbitDBNetwork } from './RegisteredOrbitDBNetwork';

export default class OrbitDBReplicatedStateRuntime {
  private readonly registeredNetworks = new Map<
    string,
    RegisteredOrbitDBNetwork
  >();

  constructor(
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly messageBus: MessageBus,
    private readonly publisher: OrbitDBReplicatedDomainEventPublisher,
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly projector: OrbitDBDomainEventProjector,
    private readonly metadataHeadRepairer: OrbitDBMetadataHeadRepairer,
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

  private async projectExistingEvents(
    networkId: string,
    stores: OrbitDBReplicatedStateStores,
  ): Promise<void> {
    const entries = await stores.events.all?.();

    for (const entry of entries || []) {
      if (this.isReplicatedMessage(entry.value)) {
        await this.projectAndDispatch(networkId, entry.value);
      }
    }
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
    this.registry.register(networkId, stores);
    this.publisher.registerNetworkStores(networkId, localPeerId, stores);
    this.subscribeToEvents(networkId, stores);
    await this.projectExistingEvents(networkId, stores);
    const repairedHeads = await this.metadataHeadRepairer.repair();

    Kernel.logger.info(
      `OrbitDB replicated state ready: networkId=${networkId} peerId=${localPeerId} repairedCommunityHeads=${repairedHeads.communities} repairedCommunityThreadSummaryHeads=${repairedHeads.communityThreadSummaries} repairedIdentityHeads=${repairedHeads.identities} repairedKeychainHeads=${repairedHeads.keychains}`,
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

    MessageBus.setReplicatedEventPublisher(this.publisher);
  }
}
