import DomainEvent from '@app/shared/domain/events/DomainEvent';

interface MessageBusAdapter {
  consume(
    queueName: string,
    bindingKey: string,
    DomainEventInstance: typeof DomainEvent,
    exchange: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void>;

  consumeDlx(
    queueName: string,
    DomainEventInstance: typeof DomainEvent,
    handler: (event: DomainEvent) => Promise<void>,
    messagesToRetry?: number,
  ): Promise<void>;

  publish(domainEvents: DomainEvent[]): Promise<void>;
}

export default MessageBusAdapter;
