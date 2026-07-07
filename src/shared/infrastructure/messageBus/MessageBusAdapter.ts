import { DomainEvent } from '@haskou/ddd-kernel/domain';

export interface MessageBusAdapter {
  consume(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: typeof DomainEvent,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void>;

  publish(domainEvents: DomainEvent[]): Promise<void>;
}
