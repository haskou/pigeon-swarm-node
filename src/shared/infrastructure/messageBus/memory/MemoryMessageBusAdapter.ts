/* eslint-disable @typescript-eslint/no-unused-vars */
import Kernel from '@app/Kernel';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import MessageBusAdapter from '../MessageBusAdapter';
import { Constructor } from '@app/shared/domain/Constructor';
import { Message } from '../Message';

export default class MemoryMessageBusAdapter implements MessageBusAdapter {
  public consumeDlx(
    _queueName: string,
    _DomainEventInstance: Constructor<DomainEvent>,
    _handler: (event: DomainEvent) => Promise<void>,
    _messagesToRetry?: number,
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public static memoryMessages: {
    [key: string]: {
      routingKey: string;
      event: string;
      exchange: string;
    }[];
  } = {};

  public static errorMemoryMessages: { [key: string]: string[] } = {};

  public async consume(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: Constructor<DomainEvent>,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    await Promise.resolve(
      setInterval(async () => {
        if (MemoryMessageBusAdapter.memoryMessages[queueName]) {
          const msg = MemoryMessageBusAdapter.memoryMessages[queueName].pop();

          if (
            msg &&
            msg.routingKey === bindingKey &&
            msg.exchange === exchange
          ) {
            const message = JSON.parse(msg.event) as Message;
            const event = new DomainEventInstance(
              message.aggregate_id,
              message.attributes,
              message.event_id,
              new Date(message.occurred_on),
              message.user_id,
            );
            try {
              await handler(event);
            } catch (error: unknown) {
              Kernel.logger.error((error as Error).message);

              if (!MemoryMessageBusAdapter.errorMemoryMessages[queueName]) {
                MemoryMessageBusAdapter.errorMemoryMessages[queueName] = [];
              }
              MemoryMessageBusAdapter.errorMemoryMessages[queueName].push(
                (error as Error).message,
              );
            }
          }
        }
      }, 50),
    );
  }

  public async publish(
    domainEvents: DomainEvent[],
    _domain?: unknown, // Whats this for?
    exchange?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      for (const domainEvent of domainEvents) {
        const queues = this.getQueueNameFromDomainEvent(domainEvent, exchange);
        for (const queue of queues) {
          if (!MemoryMessageBusAdapter.memoryMessages[queue]) {
            MemoryMessageBusAdapter.memoryMessages[queue] = [];
          }

          if (!MemoryMessageBusAdapter.errorMemoryMessages[queue]) {
            MemoryMessageBusAdapter.errorMemoryMessages[queue] = [];
          }

          MemoryMessageBusAdapter.memoryMessages[queue].push({
            routingKey: domainEvent.eventName(),
            event: domainEvent.decode(),
            exchange: exchange || `${process.env.SERVICE_NAME}`,
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

  private getQueueNameFromDomainEvent(
    domainEvent: DomainEvent,
    exchange: string,
  ): string[] {
    const consumers = Kernel.consumers;
    const queues = [];
    for (const consumer of consumers) {
      if (
        consumer.eventName === domainEvent.eventName() &&
        consumer.exchange === exchange
      ) {
        queues.push(consumer.queueName);
      }
    }

    return queues;
  }
}
