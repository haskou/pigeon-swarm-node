import LocalProcessedDomainEventRepository from '@app/shared/infrastructure/messageBus/LocalProcessedDomainEventRepository';
import Kernel from '@haskou/ddd-kernel';
import { DomainEvent } from '@haskou/ddd-kernel/domain';
import { DomainEventConsumer } from '@haskou/ddd-kernel/domain';

export default abstract class Consumer {
  private static processedEventIds = new Set<string>();
  private processedEventRepository?: LocalProcessedDomainEventRepository;

  constructor(private readonly consumer: DomainEventConsumer) {}

  private getProcessedEventId(event: DomainEvent): string {
    return `${this.queueName}:${event.eventId}`;
  }

  private getProcessedEventRepository():
    | LocalProcessedDomainEventRepository
    | undefined {
    if (this.processedEventRepository) {
      return this.processedEventRepository;
    }

    try {
      this.processedEventRepository =
        Kernel.di.getService<LocalProcessedDomainEventRepository>(
          LocalProcessedDomainEventRepository,
        );

      return this.processedEventRepository;
    } catch {
      return undefined;
    }
  }

  private async hasProcessed(event: DomainEvent): Promise<boolean> {
    if (Consumer.processedEventIds.has(this.getProcessedEventId(event))) {
      return true;
    }

    return (
      (await this.getProcessedEventRepository()?.hasProcessed(
        this.queueName,
        event,
      )) || false
    );
  }

  private async markAsProcessed(event: DomainEvent): Promise<void> {
    Consumer.processedEventIds.add(this.getProcessedEventId(event));
    await this.getProcessedEventRepository()?.markAsProcessed(
      this.queueName,
      event,
    );
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
        if (await this.hasProcessed(event)) {
          return;
        }

        await this.handler(event);
        await this.markAsProcessed(event);
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
