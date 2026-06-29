import {
  DomainEvent,
  DomainEventConsumer as KernelDomainEventConsumer,
  DomainEventConsumerContext,
} from '@haskou/ddd-kernel/domain';

export abstract class DomainEventConsumer extends KernelDomainEventConsumer {
  public abstract consume(
    queueName: string,
    bindingKey: string,
    domainEvent: typeof DomainEvent,
    exchange: string,
    handler: (
      event: DomainEvent,
      context?: DomainEventConsumerContext,
    ) => Promise<void>,
  ): Promise<void>;
}
