import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import { MongoProcessedDomainEventDocument } from '@app/shared/infrastructure/messageBus/mongo/documents/MongoProcessedDomainEventDocument';
import MongoProcessedDomainEventRepository from '@app/shared/infrastructure/messageBus/mongo/MongoProcessedDomainEventRepository';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { Collection } from 'mongodb';
import { mock, MockProxy } from 'jest-mock-extended';

describe('MongoProcessedDomainEventRepository', () => {
  let mongo: MockProxy<MongoDB>;
  let collection: MockProxy<Collection<MongoProcessedDomainEventDocument>>;
  let repository: MongoProcessedDomainEventRepository;
  const queueName = 'pigeon-swarm.register-identity-when-published';

  beforeEach(() => {
    mongo = mock<MongoDB>();
    collection = mock<Collection<MongoProcessedDomainEventDocument>>();
    repository = new MongoProcessedDomainEventRepository(mongo);

    mongo.getCollection.mockResolvedValue(collection as never);
  });

  it('should know when a domain event has already been processed by a queue', async () => {
    const event = new IdentityWasCreatedEvent('identity-id');

    collection.findOne.mockResolvedValue({
      _id: `${queueName}:${event.eventId}`,
      aggregateId: event.aggregateId,
      eventId: event.eventId,
      eventName: event.eventName(),
      processedAt: 1,
      queueName,
    });

    const result = await repository.hasProcessed(queueName, event);

    expect(result).toBe(true);
    expect(collection.findOne).toHaveBeenCalledWith({
      _id: `${queueName}:${event.eventId}`,
    });
  });

  it('should know when a domain event has not been processed by a queue', async () => {
    const event = new IdentityWasCreatedEvent('identity-id');

    collection.findOne.mockResolvedValue(null);

    await expect(repository.hasProcessed(queueName, event)).resolves.toBe(
      false,
    );
  });

  it('should mark a domain event as processed by a queue', async () => {
    const event = new IdentityWasCreatedEvent('identity-id');

    await repository.markAsProcessed(queueName, event);

    expect(mongo.getCollection).toHaveBeenCalledWith(
      'processed_domain_events',
    );
    expect(collection.updateOne).toHaveBeenCalledWith(
      {
        _id: `${queueName}:${event.eventId}`,
      },
      {
        $setOnInsert: {
          _id: `${queueName}:${event.eventId}`,
          aggregateId: event.aggregateId,
          eventId: event.eventId,
          eventName: event.eventName(),
          processedAt: expect.any(Number),
          queueName,
        },
      },
      { upsert: true },
    );
  });
});
