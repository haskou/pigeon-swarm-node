import DomainEvent from './DomainEvent';

export default abstract class DomainEventConsumer {
  public abstract consume(
    queueName: string,
    bindingKey: string,
    domainEvent: typeof DomainEvent,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void>;
}
