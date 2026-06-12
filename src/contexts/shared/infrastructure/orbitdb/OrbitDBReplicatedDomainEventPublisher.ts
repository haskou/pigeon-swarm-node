import DomainEvent from '@app/shared/domain/events/DomainEvent';

import { OrbitDBDatabase } from './OrbitDBDatabase';
import OrbitDBDomainEventProjector from './OrbitDBDomainEventProjector';
import { OrbitDBReplicatedStateStores } from './OrbitDBReplicatedStateStores';
import { ReplicatedDomainEventMessage } from './ReplicatedDomainEventMessage';

// eslint-disable-next-line max-len
export default class OrbitDBReplicatedDomainEventPublisher {
  private readonly storesByNetworkId = new Map<
    string,
    {
      localPeerId: string;
      stores: OrbitDBReplicatedStateStores;
    }
  >();

  constructor(private readonly projector: OrbitDBDomainEventProjector) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private stringValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string | undefined {
    const value = document[attribute];

    return typeof value === 'string' ? value : undefined;
  }

  private stringArrayValue(
    document: Record<string, unknown>,
    attribute: string,
  ): string[] {
    const value = document[attribute];

    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value
      : [];
  }

  private async queryStore(
    store: OrbitDBDatabase | undefined,
    matcher: (document: Record<string, unknown>) => boolean,
  ): Promise<Array<Record<string, unknown>>> {
    if (!store) {
      return [];
    }

    if (store.query) {
      return store.query(matcher);
    }

    const entries = await store.all?.();

    return (entries || [])
      .map((entry) => entry.value)
      .filter(
        (value): value is Record<string, unknown> =>
          this.isRecord(value) && matcher(value),
      );
  }

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

  private relatedDocumentId(event: DomainEvent):
    | {
        storeName: 'communities' | 'conversations';
        value: string;
      }
    | undefined {
    const communityId = this.stringValue(event.attributes, 'communityId');

    if (communityId) {
      return { storeName: 'communities', value: communityId };
    }

    const conversationId = this.stringValue(event.attributes, 'conversationId');

    if (conversationId) {
      return { storeName: 'conversations', value: conversationId };
    }

    const notification = event.attributes.notification;

    if (this.isRecord(notification)) {
      const payload = notification.payload;

      return this.isRecord(payload)
        ? this.relatedDocumentId({
            ...event,
            attributes: payload,
          } as DomainEvent)
        : undefined;
    }

    return undefined;
  }

  private relatedIdentityId(event: DomainEvent): string | undefined {
    return (
      this.stringValue(event.attributes, 'ownerIdentityId') ||
      this.stringValue(event.attributes, 'identityId') ||
      event.aggregateId
    );
  }

  private async networkIdsFromRelatedDocument(
    event: DomainEvent,
  ): Promise<string[]> {
    const related = this.relatedDocumentId(event);

    if (!related) {
      return [];
    }

    const networkIds: string[] = [];

    for (const { stores } of this.storesByNetworkId.values()) {
      const documents = await this.queryStore(
        stores[related.storeName],
        (document) => this.stringValue(document, 'id') === related.value,
      );

      networkIds.push(
        ...documents.flatMap((document) => [
          ...this.stringArrayValue(document, 'networkIds'),
          ...(this.stringValue(document, 'networkId')
            ? [this.stringValue(document, 'networkId') as string]
            : []),
        ]),
      );
    }

    return [...new Set(networkIds)];
  }

  private async networkIdsFromIdentity(event: DomainEvent): Promise<string[]> {
    const identityId = this.relatedIdentityId(event);

    if (!identityId) {
      return [];
    }

    const networkIds: string[] = [];

    for (const { stores } of this.storesByNetworkId.values()) {
      const documents = await this.queryStore(
        stores.identities,
        (document) =>
          this.stringValue(document, 'id') === identityId ||
          this.stringValue(document, 'identityId') === identityId,
      );

      networkIds.push(
        ...documents.flatMap((document) => [
          ...this.stringArrayValue(document, 'networkIds'),
          ...(this.stringValue(document, 'networkId')
            ? [this.stringValue(document, 'networkId') as string]
            : []),
        ]),
      );
    }

    return [...new Set(networkIds)];
  }

  private targetStoresForNetworkIds(networkIds: string[]): Array<{
    localPeerId: string;
    networkId: string;
    stores: OrbitDBReplicatedStateStores;
  }> {
    const targets = new Map<
      string,
      {
        localPeerId: string;
        networkId: string;
        stores: OrbitDBReplicatedStateStores;
      }
    >();

    for (const networkId of networkIds) {
      const registeredStores = this.storesByNetworkId.get(networkId);

      if (registeredStores) {
        targets.set(networkId, { networkId, ...registeredStores });
      }
    }

    if (targets.size > 0) {
      return [...targets.values()];
    }

    if (networkIds.length > 0) {
      return [];
    }

    return [...this.storesByNetworkId.entries()].map(
      ([networkId, registeredStores]) => ({
        networkId,
        ...registeredStores,
      }),
    );
  }

  private async getTargetStores(event: DomainEvent): Promise<
    Array<{
      localPeerId: string;
      networkId: string;
      stores: OrbitDBReplicatedStateStores;
    }>
  > {
    const explicitNetworkIds = this.eventNetworkIds(event);

    if (explicitNetworkIds.length > 0) {
      return this.targetStoresForNetworkIds([...new Set(explicitNetworkIds)]);
    }

    const networkIds = [
      ...new Set([
        ...(await this.networkIdsFromRelatedDocument(event)),
        ...(await this.networkIdsFromIdentity(event)),
      ]),
    ];

    return this.targetStoresForNetworkIds(networkIds);
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

  public unregisterNetworkStores(networkId: string): void {
    this.storesByNetworkId.delete(networkId);
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    for (const event of domainEvents) {
      const targetStores = await this.getTargetStores(event);

      for (const { localPeerId, networkId, stores } of targetStores) {
        const message = this.toReplicatedMessage(event, networkId, localPeerId);

        await stores.events.add?.(message);
        await this.projector.project(stores, message);
      }
    }
  }
}
