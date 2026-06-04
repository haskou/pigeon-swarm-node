import DomainEvent from './DomainEvent';

interface DomainEventConsumer {
  consume(
    queueName: string,
    bindingKey: string,
    domainEvent: typeof DomainEvent,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void>;
}

export default DomainEventConsumer;
