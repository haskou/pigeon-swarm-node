import DomainEvent from '@app/shared/domain/events/DomainEvent';
import { MongoProcessedDomainEventDocument } from '@app/shared/infrastructure/messageBus/mongo/documents/MongoProcessedDomainEventDocument';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

export default class MongoProcessedDomainEventRepository {
  private static readonly COLLECTION = 'processed_domain_events';

  constructor(private readonly mongo: MongoDB) {}

  private getDocumentId(queueName: string, event: DomainEvent): string {
    return `${queueName}:${event.eventId}`;
  }

  private async collection() {
    return this.mongo.getCollection<MongoProcessedDomainEventDocument>(
      MongoProcessedDomainEventRepository.COLLECTION,
    );
  }

  public async hasProcessed(
    queueName: string,
    event: DomainEvent,
  ): Promise<boolean> {
    const document = await (
      await this.collection()
    ).findOne({
      _id: this.getDocumentId(queueName, event),
    });

    return document !== null;
  }

  public async markAsProcessed(
    queueName: string,
    event: DomainEvent,
  ): Promise<void> {
    const processedAt = Date.now();

    await (
      await this.collection()
    ).updateOne(
      {
        _id: this.getDocumentId(queueName, event),
      },
      {
        $setOnInsert: {
          _id: this.getDocumentId(queueName, event),
          aggregateId: event.aggregateId,
          eventId: event.eventId,
          eventName: event.eventName(),
          processedAt,
          queueName,
        },
      },
      { upsert: true },
    );
  }
}
