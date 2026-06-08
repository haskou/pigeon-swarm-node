import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { PubSubTransport } from '@app/shared/infrastructure/pubsub/PubSubTransport';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';

import { Message } from '../Message';
import MessageBusAdapter from '../MessageBusAdapter';
import PubSubNetworkMessageCodec from './PubSubNetworkMessageCodec';
import PubSubTopicResolver from './PubSubTopicResolver';

type SubscriptionHandler = (event: DomainEvent) => Promise<void>;

export default class Libp2pGossipsubAdapter implements MessageBusAdapter {
  private static readonly maxProcessedEventIds = 5000;

  private readonly topicResolver: PubSubTopicResolver;
  private readonly codec: PubSubNetworkMessageCodec;
  private readonly processedEventIds: string[] = [];
  private readonly processedEventIdSet = new Set<string>();
  private readonly subscriptionHandlers = new Map<
    string,
    SubscriptionHandler[]
  >();

  constructor(
    private readonly transport: PubSubTransport,
    private readonly networkRegistry?: IPFSNetworkRegistry,
    topicResolver?: PubSubTopicResolver,
  ) {
    this.topicResolver = topicResolver || new PubSubTopicResolver();
    this.codec = new PubSubNetworkMessageCodec();
  }

  private instanceDomainEvent(
    DomainEventInstance: Constructor<DomainEvent>,
    message: Message,
  ): DomainEvent {
    return new DomainEventInstance(
      message.aggregate_id,
      message.attributes,
      message.event_id,
      new Date(message.occurred_on),
      message.user_id,
    );
  }

  private networkTopic(routingKey: string, network: IPFSNetwork): string {
    return this.topicResolver.fromRoutingKeyForNetwork(
      routingKey,
      network.getId(),
    );
  }

  private privateFallbackTopic(
    routingKey: string,
    network: IPFSNetwork,
  ): string | undefined {
    const key = network.getConfig().getKey();

    if (!network.isPrivate() || !key) {
      return undefined;
    }

    return this.topicResolver.fromRoutingKeyForPrivateNetworkFallback(
      routingKey,
      key,
    );
  }

  private shouldProcessEvent(event: DomainEvent): boolean {
    if (!event.eventId) {
      return true;
    }

    if (this.processedEventIdSet.has(event.eventId)) {
      return false;
    }

    this.processedEventIdSet.add(event.eventId);
    this.processedEventIds.push(event.eventId);

    if (
      this.processedEventIds.length >
      Libp2pGossipsubAdapter.maxProcessedEventIds
    ) {
      const oldestEventId = this.processedEventIds.shift();

      if (oldestEventId) {
        this.processedEventIdSet.delete(oldestEventId);
      }
    }

    return true;
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

  private networksForEvent(event: DomainEvent): IPFSNetwork[] {
    if (!this.networkRegistry) {
      return [];
    }

    const networks = this.networkRegistry.getAll();
    const networkIds = this.eventNetworkIds(event);

    if (networkIds.length === 0) {
      return networks;
    }

    return networks.filter((network) => networkIds.includes(network.getId()));
  }

  private async subscribeToNetwork(
    bindingKey: string,
    network: IPFSNetwork,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: SubscriptionHandler,
  ): Promise<void> {
    const topic = this.networkTopic(bindingKey, network);
    const subscriptionKey = `${topic}:${bindingKey}`;
    const handlers = this.subscriptionHandlers.get(subscriptionKey);

    if (handlers) {
      handlers.push(handler);

      return;
    }

    this.subscriptionHandlers.set(subscriptionKey, [handler]);

    await network.subscribePubSub(topic, async (payload) => {
      const message = JSON.parse(
        this.codec.decode(payload, network),
      ) as Message;

      if (message.type !== bindingKey) {
        return;
      }

      const event = this.instanceDomainEvent(DomainEventInstance, message);

      if (!this.shouldProcessEvent(event)) {
        return;
      }

      await Promise.all(
        (this.subscriptionHandlers.get(subscriptionKey) || []).map(
          (subscriptionHandler) => subscriptionHandler(event),
        ),
      );

      webSocketEventHub.publish([event]);
    });
  }

  private async subscribeToPrivateFallback(
    bindingKey: string,
    network: IPFSNetwork,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: SubscriptionHandler,
  ): Promise<void> {
    const topic = this.privateFallbackTopic(bindingKey, network);

    if (!topic) {
      return;
    }

    const subscriptionKey = `${topic}:${bindingKey}`;
    const handlers = this.subscriptionHandlers.get(subscriptionKey);

    if (handlers) {
      handlers.push(handler);

      return;
    }

    this.subscriptionHandlers.set(subscriptionKey, [handler]);

    await this.transport.subscribe(topic, async (payload) => {
      const message = JSON.parse(
        this.codec.decode(payload, network),
      ) as Message;

      if (message.type !== bindingKey) {
        return;
      }

      const event = this.instanceDomainEvent(DomainEventInstance, message);

      if (!this.shouldProcessEvent(event)) {
        return;
      }

      await Promise.all(
        (this.subscriptionHandlers.get(subscriptionKey) || []).map(
          (subscriptionHandler) => subscriptionHandler(event),
        ),
      );

      webSocketEventHub.publish([event]);
    });
  }

  private async subscribeToNetworkAndFallback(
    bindingKey: string,
    network: IPFSNetwork,
    DomainEventInstance: Constructor<DomainEvent>,
    handler: SubscriptionHandler,
  ): Promise<void> {
    await this.subscribeToNetwork(
      bindingKey,
      network,
      DomainEventInstance,
      handler,
    );
    await this.subscribeToPrivateFallback(
      bindingKey,
      network,
      DomainEventInstance,
      handler,
    );
  }

  public async consume(
    _queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    _exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    if (this.networkRegistry) {
      await Promise.all(
        this.networkRegistry
          .getAll()
          .map((network) =>
            this.subscribeToNetworkAndFallback(
              bindingKey,
              network,
              DomainEventInstance,
              handler,
            ),
          ),
      );

      this.networkRegistry.onNetworkRegistered((network) => {
        void this.subscribeToNetworkAndFallback(
          bindingKey,
          network,
          DomainEventInstance,
          handler,
        );
      });

      return;
    }

    await this.transport.subscribe(
      this.topicResolver.fromRoutingKey(bindingKey),
      async (payload) => {
        const message = JSON.parse(payload) as Message;

        if (message.type !== bindingKey) {
          return;
        }

        const event = this.instanceDomainEvent(DomainEventInstance, message);

        if (!this.shouldProcessEvent(event)) {
          return;
        }

        await handler(event);
        webSocketEventHub.publish([event]);
      },
    );
  }

  public consumeDlx(): Promise<void> {
    throw new Error('PubSub dead-letter queues are not supported.');
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    if (this.networkRegistry) {
      const networks = this.networkRegistry.getAll();

      if (networks.length > 0) {
        await Promise.all(
          domainEvents.flatMap((event) =>
            this.networksForEvent(event).flatMap((network) => {
              const encodedPayload = this.codec.encode(event.decode(), network);
              const fallbackTopic = this.privateFallbackTopic(
                event.eventName(),
                network,
              );

              return [
                network.publishPubSub(
                  this.networkTopic(event.eventName(), network),
                  encodedPayload,
                ),
                ...(fallbackTopic
                  ? [this.transport.publish(fallbackTopic, encodedPayload)]
                  : []),
              ];
            }),
          ),
        );

        return;
      }
    }

    await Promise.all(
      domainEvents.map((event) =>
        this.transport.publish(
          this.topicResolver.fromRoutingKey(event.eventName()),
          event.decode(),
        ),
      ),
    );
  }
}
