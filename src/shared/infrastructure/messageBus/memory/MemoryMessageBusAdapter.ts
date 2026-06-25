import Kernel from '@haskou/ddd-kernel';
import { Constructor } from '@haskou/ddd-kernel/domain';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

import { Message } from '../Message';
import MessageBusAdapter from '../MessageBusAdapter';

type MemoryMessage = {
  routingKey: string;
  event: string;
  exchange: string;
};

export default class MemoryMessageBusAdapter implements MessageBusAdapter {
  public static memoryMessages: Record<string, MemoryMessage[]> = {};

  public static errorMemoryMessages: Record<string, string[]> = {};

  private getQueueNameFromDomainEvent(
    domainEvent: DomainEvent,
    exchange: string,
  ): string[] {
    return Kernel.consumers
      .filter(
        (consumer) =>
          consumer.eventName === domainEvent.eventName() &&
          consumer.exchange === exchange,
      )
      .map((consumer) => consumer.queueName);
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

  private recordHandlerError(queueName: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);

    Kernel.logger.error(message);
    this.ensureQueue(queueName);
    MemoryMessageBusAdapter.errorMemoryMessages[queueName].push(message);
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
      this.recordHandlerError(queueName, error);
    }
  }

  public async consume(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    await Promise.resolve(
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
  }

  public async publish(
    domainEvents: DomainEvent[],
    _domain?: unknown, // Whats this for?
    exchange?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      const targetExchange =
        exchange || process.env.SERVICE_NAME || 'pigeon-swarm';

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
