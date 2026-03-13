import Kernel from '@app/Kernel';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';

export default abstract class Consumer {
  constructor(private readonly consumer: DomainEventConsumer) {}

  public abstract get queueName(): string;
  public abstract get eventName(): string;
  public abstract get domainEvent(): typeof DomainEvent;
  public abstract get exchange(): string;
  public abstract handler(event: DomainEvent): Promise<void>;

  public async init(): Promise<void> {
    await this.consumer.consume(
      this.queueName,
      this.eventName,
      this.domainEvent,
      this.exchange,
      ((event: DomainEvent) => this.handler(event)) as (
        event: DomainEvent,
      ) => Promise<void>,
    );
  }

  public get<T>(service: unknown): T {
    return Kernel.di.getService<T>(service);
  }

  public getCorrelationId(event: DomainEvent): string | undefined {
    return 'correlationId' in event
      ? (event as unknown as { correlationId: string }).correlationId
      : undefined;
  }

  public getCausationId(event: DomainEvent): string | undefined {
    return 'eventId' in event
      ? (event as { eventId: string }).eventId
      : undefined;
  }
}
