import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { errorClassName } from '@app/shared/infrastructure/logs/ErrorClassName';
import PubSubTransport from '@app/shared/infrastructure/pubsub/PubSubTransport';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import Kernel from '@haskou/ddd-kernel';
import { Constructor } from '@haskou/ddd-kernel/domain';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { Message } from '../Message';
import { MessageBusAdapter } from '../MessageBusAdapter';
import { networkFanoutSuppression } from '../NetworkFanoutSuppression';
import PubSubNetworkMessageCodec from './PubSubNetworkMessageCodec';
import PubSubTopicResolver from './PubSubTopicResolver';

interface Subscription {
  queueName: string;
  handler: (event: DomainEvent) => Promise<void>;
}

export default class Libp2pGossipsubAdapter implements MessageBusAdapter {
  private readonly subscriptions = new Map<string, Subscription[]>();

  constructor(
    private readonly transport: PubSubTransport,
    private readonly networkRegistry: IPFSNetworkRegistry,
    private readonly topicResolver: PubSubTopicResolver,
    private readonly codec: PubSubNetworkMessageCodec,
  ) {}

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

  /**
   * Logs only static labels and the error class: the topic carries the network
   * id, and payload fields and exception messages can carry private data.
   */
  private logDroppedEvent(
    bindingKey: string,
    cause: string,
    error: unknown,
  ): void {
    Kernel.logger.error(
      `Dropped pubsub event: event=${bindingKey} ${cause} error=${errorClassName(error)}`,
    );
  }

  private decodeEvent(
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    payload: string,
  ): DomainEvent | undefined {
    const message = JSON.parse(payload) as Message;

    if (message.type !== bindingKey) {
      return undefined;
    }

    return this.instanceDomainEvent(DomainEventInstance, message);
  }

  private async deliver(
    bindingKey: string,
    subscriptionKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    readPayload: () => string,
  ): Promise<void> {
    let event: DomainEvent | undefined;

    try {
      event = this.decodeEvent(bindingKey, DomainEventInstance, readPayload());
    } catch (error: unknown) {
      this.logDroppedEvent(bindingKey, 'stage=decode', error);

      return;
    }

    if (!event) {
      return;
    }

    const subscriptions = [...(this.subscriptions.get(subscriptionKey) || [])];
    const results = await Promise.allSettled(
      subscriptions.map(({ handler }) => handler(event)),
    );
    let dropped = false;

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        dropped = true;
        this.logDroppedEvent(
          bindingKey,
          `consumer=${subscriptions[index].queueName}`,
          result.reason,
        );
      }
    });

    if (!dropped && !networkFanoutSuppression.has(event)) {
      webSocketEventHub.publishFromNetwork([event]);
    }
  }

  private async subscribeToNetwork(
    bindingKey: string,
    network: IPFSNetwork,
    DomainEventInstance: Constructor<DomainEvent>,
    subscription: Subscription,
  ): Promise<void> {
    const topic = this.networkTopic(bindingKey, network);
    const subscriptionKey = `${topic}:${bindingKey}`;
    const subscriptions = this.subscriptions.get(subscriptionKey);

    if (subscriptions) {
      subscriptions.push(subscription);

      return;
    }

    this.subscriptions.set(subscriptionKey, [subscription]);

    await network.subscribePubSub(topic, (payload) =>
      this.deliver(bindingKey, subscriptionKey, DomainEventInstance, () =>
        this.codec.decode(payload, network, topic),
      ),
    );
  }

  private async subscribeToTransport(
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    subscription: Subscription,
  ): Promise<void> {
    const topic = this.topicResolver.fromRoutingKey(bindingKey);
    const subscriptionKey = `${topic}:${bindingKey}`;
    const subscriptions = this.subscriptions.get(subscriptionKey);

    if (subscriptions) {
      subscriptions.push(subscription);

      return;
    }

    this.subscriptions.set(subscriptionKey, [subscription]);

    await this.transport.subscribe(topic, (payload) =>
      this.deliver(
        bindingKey,
        subscriptionKey,
        DomainEventInstance,
        () => payload,
      ),
    );
  }

  public async consume(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    _exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    const subscription: Subscription = { handler, queueName };

    if (this.networkRegistry) {
      const networks = this.networkRegistry.getAll();

      if (networks.length > 0) {
        await Promise.all(
          networks.map((network) =>
            this.subscribeToNetwork(
              bindingKey,
              network,
              DomainEventInstance,
              subscription,
            ),
          ),
        );
      }

      this.networkRegistry.onNetworkRegistered((network) => {
        void this.subscribeToNetwork(
          bindingKey,
          network,
          DomainEventInstance,
          subscription,
        );
      });

      if (networks.length > 0) {
        return;
      }
    }

    await this.subscribeToTransport(
      bindingKey,
      DomainEventInstance,
      subscription,
    );
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    if (this.networkRegistry) {
      const networks = this.networkRegistry.getAll();

      if (networks.length > 0) {
        await Promise.all(
          domainEvents.flatMap((event) =>
            this.networksForEvent(event).map((network) => {
              const topic = this.networkTopic(event.eventName(), network);

              return network.publishPubSub(
                topic,
                this.codec.encode(event.decode(), network, topic),
              );
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
