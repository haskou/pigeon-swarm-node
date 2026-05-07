import { Constructor } from '@app/shared/domain/Constructor';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { PubSubTransport } from '@app/shared/infrastructure/pubsub/PubSubTransport';

import { Message } from '../Message';
import MessageBusAdapter from '../MessageBusAdapter';

export default class HeliaPubSubMessageBusAdapter implements MessageBusAdapter {
  constructor(private readonly transport: PubSubTransport) {}

  private getTopic(exchange: string, routingKey: string): string {
    return `${exchange}.${routingKey}`;
  }

  private instanceDomainEvent(
    DomainEventInstance: Constructor<DomainEvent>,
    payload: string,
  ): DomainEvent {
    const message = JSON.parse(payload) as Message;

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
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    await this.transport.subscribe(
      this.getTopic(exchange, bindingKey),
      async (payload) =>
        handler(this.instanceDomainEvent(DomainEventInstance, payload)),
    );
  }

  public consumeDlx(): Promise<void> {
    throw new Error('PubSub dead-letter queues are not supported.');
  }

  public async publish(domainEvents: DomainEvent[]): Promise<void> {
    const exchange = process.env.SERVICE_NAME || 'pigeon-swarm';

    await Promise.all(
      domainEvents.map((event) =>
        this.transport.publish(
          this.getTopic(exchange, event.eventName()),
          event.decode(),
        ),
      ),
    );
  }
}
