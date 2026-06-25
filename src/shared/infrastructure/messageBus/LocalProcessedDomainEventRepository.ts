import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { DomainEvent } from '@haskou/ddd-kernel/domain';

export default class LocalProcessedDomainEventRepository {
  private static readonly NAMESPACE = 'processed_domain_events';

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private getDocumentId(queueName: string, event: DomainEvent): string {
    return `${queueName}:${event.eventId}`;
  }

  public async hasProcessed(
    queueName: string,
    event: DomainEvent,
  ): Promise<boolean> {
    const document = await this.database.findOne(
      LocalProcessedDomainEventRepository.NAMESPACE,
      this.getDocumentId(queueName, event),
    );

    return document !== undefined;
  }

  public async markAsProcessed(
    queueName: string,
    event: DomainEvent,
  ): Promise<void> {
    const id = this.getDocumentId(queueName, event);

    await this.database.save(
      LocalProcessedDomainEventRepository.NAMESPACE,
      id,
      {
        aggregateId: event.aggregateId,
        eventId: event.eventId,
        eventName: event.eventName(),
        processedAt: Date.now(),
        queueName,
      },
    );
  }
}
