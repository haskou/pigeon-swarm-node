import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { PubSubTransport } from '@app/shared/infrastructure/pubsub/PubSubTransport';

import { Message } from '../Message';
import MessageBusAdapter from '../MessageBusAdapter';
import PubSubTopicResolver from './PubSubTopicResolver';

export default class Libp2pGossipsubAdapter implements MessageBusAdapter {
  private readonly topicResolver: PubSubTopicResolver;

  constructor(
    private readonly transport: PubSubTransport,
    topicResolver?: PubSubTopicResolver,
  ) {
    this.topicResolver = topicResolver || new PubSubTopicResolver();
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

  public async consume(
    _queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    _exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    await this.transport.subscribe(
      this.topicResolver.fromRoutingKey(bindingKey),
      async (payload) => {
        const message = JSON.parse(payload) as Message;

        if (message.type !== bindingKey) {
          return;
        }

        await handler(this.instanceDomainEvent(DomainEventInstance, message));
      },
    );
  }

  public consumeDlx(): Promise<void> {
    throw new Error('PubSub dead-letter queues are not supported.');
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
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
