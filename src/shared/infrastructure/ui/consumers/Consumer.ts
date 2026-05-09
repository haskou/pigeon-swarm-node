import Kernel from '@app/Kernel';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import DomainEventConsumer from '@app/shared/domain/events/DomainEventConsumer';

export default abstract class Consumer {
  private static processedEventIds = new Set<string>();

  constructor(private readonly consumer: DomainEventConsumer) {}

  private getProcessedEventId(event: DomainEvent): string {
    return `${this.queueName}:${event.eventId}`;
  }

  private hasProcessed(event: DomainEvent): boolean {
    return Consumer.processedEventIds.has(this.getProcessedEventId(event));
  }

  private markAsProcessed(event: DomainEvent): void {
    Consumer.processedEventIds.add(this.getProcessedEventId(event));
  }

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
      (async (event: DomainEvent) => {
        if (this.hasProcessed(event)) {
          return;
        }

        await this.handler(event);
        this.markAsProcessed(event);
      }) as (event: DomainEvent) => Promise<void>,
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
