import DomainEvent from './DomainEvent';

interface DomainEventConsumer {
  consume(
    queueName: string,
    bindingKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    domainEvent: any,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void>;
}

export default DomainEventConsumer;
