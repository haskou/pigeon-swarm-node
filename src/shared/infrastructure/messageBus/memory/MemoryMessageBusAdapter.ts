import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import MemoryMessageBusAdapterClosedError from '@app/shared/infrastructure/errors/MemoryMessageBusAdapterClosedError';
import { errorClassName } from '@app/shared/infrastructure/logs/ErrorClassName';
import Kernel from '@haskou/ddd-kernel';
import { Constructor } from '@haskou/ddd-kernel/domain';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { Message } from '../Message';
import { MessageBusAdapter } from '../MessageBusAdapter';

type MemoryMessage = {
  routingKey: string;
  event: string;
  exchange: string;
};

export default class MemoryMessageBusAdapter implements MessageBusAdapter {
  private static readonly consumerEventNameProperty = 'eventName';

  private static readonly consumerExchangeProperty = 'exchange';

  public static memoryMessages: Record<string, MemoryMessage[]> = {};

  public static errorMemoryMessages: Record<string, string[]> = {};

  private readonly pollers = new Set<NodeJS.Timeout>();

  private closed = false;

  private getQueueNameFromDomainEvent(
    domainEvent: DomainEvent,
    exchange: string,
  ): string[] {
    return Kernel.consumers
      .filter(
        (consumer) =>
          this.consumerEventName(consumer) === domainEvent.eventName() &&
          this.consumerExchange(consumer) === exchange,
      )
      .map((consumer) => consumer.queueName);
  }

  private consumerEventName(consumer: object): string | undefined {
    return this.consumerStringProperty(
      consumer,
      MemoryMessageBusAdapter.consumerEventNameProperty,
    );
  }

  private consumerExchange(consumer: object): string | undefined {
    return this.consumerStringProperty(
      consumer,
      MemoryMessageBusAdapter.consumerExchangeProperty,
    );
  }

  private consumerStringProperty(
    consumer: object,
    property: string,
  ): string | undefined {
    const value: unknown = Reflect.get(consumer, property);

    return typeof value === 'string' ? value : undefined;
  }

  private ensureQueue(queueName: string): void {
    MemoryMessageBusAdapter.memoryMessages[queueName] ??= [];
    MemoryMessageBusAdapter.errorMemoryMessages[queueName] ??= [];
  }

  private matchesSubscription(
    message: MemoryMessage,
    bindingKey: string,
    exchange: string,
  ): boolean {
    return message.routingKey === bindingKey && message.exchange === exchange;
  }

  private toDomainEvent(
    message: MemoryMessage,
    DomainEventInstance: Constructor<DomainEvent>,
  ): DomainEvent {
    const event = JSON.parse(message.event) as Message;

    return new DomainEventInstance(
      event.aggregate_id,
      event.attributes,
      event.event_id,
      new Date(event.occurred_on),
      event.user_id,
    );
  }

  private recordHandlerError(
    queueName: string,
    bindingKey: string,
    error: unknown,
  ): void {
    Kernel.logger.error(
      `Dropped in-memory event: event=${bindingKey} consumer=${queueName} error=${errorClassName(error)}`,
    );
    this.ensureQueue(queueName);
    MemoryMessageBusAdapter.errorMemoryMessages[queueName].push(
      error instanceof Error ? error.message : String(error),
    );
  }

  private async handleQueuedMessage(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    const message = MemoryMessageBusAdapter.memoryMessages[queueName]?.pop();

    if (!message || !this.matchesSubscription(message, bindingKey, exchange)) {
      return;
    }

    try {
      await handler(this.toDomainEvent(message, DomainEventInstance));
    } catch (error: unknown) {
      this.recordHandlerError(queueName, bindingKey, error);
    }
  }

  /** Refuses a consumer once closed, so a stopped node starts no new timer. */
  public consume(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    if (this.closed) {
      return Promise.reject(new MemoryMessageBusAdapterClosedError());
    }

    this.pollers.add(
      setInterval(
        () =>
          void this.handleQueuedMessage(
            queueName,
            bindingKey,
            DomainEventInstance,
            exchange,
            handler,
          ),
        50,
      ),
    );

    return Promise.resolve();
  }

  /** Stops every consumer timer: no queued message is delivered after this returns. */
  public close(): void {
    this.closed = true;

    for (const poller of this.pollers) {
      clearInterval(poller);
    }

    this.pollers.clear();
  }

  public async publish(
    domainEvents: DomainEvent[],
    _domain?: unknown, // Whats this for?
    exchange?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      const targetExchange =
        exchange || pigeonEnvironment().SERVICE_NAME || 'pigeon-swarm';

      for (const domainEvent of domainEvents) {
        const queues = this.getQueueNameFromDomainEvent(
          domainEvent,
          targetExchange,
        );

        for (const queue of queues) {
          this.ensureQueue(queue);

          MemoryMessageBusAdapter.memoryMessages[queue].push({
            event: domainEvent.decode(),
            exchange: targetExchange,
            routingKey: domainEvent.eventName(),
          });
        }
      }
      resolve();
    });
  }

  public getMemoryMessageLength(
    domainEvent: DomainEvent,
    exchange: string,
  ): number {
    const queues = this.getQueueNameFromDomainEvent(domainEvent, exchange);
    let messages = 0;
    for (const queue of queues) {
      messages += MemoryMessageBusAdapter.memoryMessages[queue]?.length || 0;
    }

    return messages;
  }
}
