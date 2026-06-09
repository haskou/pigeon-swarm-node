import DomainEvent from '@app/shared/domain/events/DomainEvent';
import EventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { OrbitDBDomainEventProjector } from './OrbitDBDomainEventProjector';
import { OrbitDBReplicatedStateStores } from './OrbitDBReplicatedStateStores';
import { ReplicatedDomainEventMessage } from './ReplicatedDomainEventMessage';

export class OrbitDBReplicatedDomainEventPublisher implements EventPublisher {
  private readonly storesByNetworkId = new Map<
    string,
    {
      localPeerId: string;
      stores: OrbitDBReplicatedStateStores;
    }
  >();

  constructor(private readonly projector = new OrbitDBDomainEventProjector()) {}

  private eventNetworkIds(event: DomainEvent): string[] {
    const networkId = event.attributes.networkId;
    const networkIds = event.attributes.networkIds;
    const networks = event.attributes.networks;

    if (typeof networkId === 'string') {
      return [networkId];
    }

    if (Array.isArray(networkIds)) {
      return networkIds.filter((id): id is string => typeof id === 'string');
    }

    if (Array.isArray(networks)) {
      return networks
        .map((network) =>
          typeof network === 'object' && network !== null && 'id' in network
            ? (network.id as unknown)
            : undefined,
        )
        .filter((id): id is string => typeof id === 'string');
    }

    return [];
  }

  private getTargetStores(event: DomainEvent): Array<{
    localPeerId: string;
    networkId: string;
    stores: OrbitDBReplicatedStateStores;
  }> {
    const networkIds = this.eventNetworkIds(event);

    if (networkIds.length === 0) {
      return [...this.storesByNetworkId.entries()].map(
        ([networkId, registeredStores]) => ({
          networkId,
          ...registeredStores,
        }),
      );
    }

    return networkIds.flatMap((networkId) => {
      const registeredStores = this.storesByNetworkId.get(networkId);

      return registeredStores ? [{ networkId, ...registeredStores }] : [];
    });
  }

  private toReplicatedMessage(
    event: DomainEvent,
    networkId: string,
    originPeerId: string,
  ): ReplicatedDomainEventMessage {
    return {
      ...(JSON.parse(event.decode()) as Omit<
        ReplicatedDomainEventMessage,
        'replication'
      >),
      replication: {
        networkId,
        originPeerId,
      },
    };
  }

  public registerNetworkStores(
    networkId: string,
    localPeerId: string,
    stores: OrbitDBReplicatedStateStores,
  ): void {
    this.storesByNetworkId.set(networkId, { localPeerId, stores });
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    for (const event of domainEvents) {
      for (const { localPeerId, networkId, stores } of this.getTargetStores(
        event,
      )) {
        const message = this.toReplicatedMessage(event, networkId, localPeerId);

        await stores.events.add?.(message);
        await this.projector.project(stores, message);
      }
    }
  }
}
