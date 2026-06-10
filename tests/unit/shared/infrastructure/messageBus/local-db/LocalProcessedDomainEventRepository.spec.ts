import { IdentityWasCreatedEvent } from '@app/contexts/identities/domain/events/IdentityWasCreatedEvent';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import LocalProcessedDomainEventRepository from '@app/shared/infrastructure/messageBus/LocalProcessedDomainEventRepository';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LocalProcessedDomainEventRepository', () => {
  let database: MockProxy<EmbeddedLocalDatabase>;
  let repository: LocalProcessedDomainEventRepository;
  const queueName = 'pigeon-swarm.register-identity-when-published';

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    repository = new LocalProcessedDomainEventRepository(database);
  });

  it('should know when a domain event has already been processed by a queue', async () => {
    const event = new IdentityWasCreatedEvent('identity-id');

    database.findOne.mockResolvedValue({
      _id: `${queueName}:${event.eventId}`,
      aggregateId: event.aggregateId,
      eventId: event.eventId,
      eventName: event.eventName(),
      processedAt: 1,
      queueName,
    });

    const result = await repository.hasProcessed(queueName, event);

    expect(result).toBe(true);
    expect(database.findOne).toHaveBeenCalledWith(
      'processed_domain_events',
      `${queueName}:${event.eventId}`,
    );
  });

  it('should know when a domain event has not been processed by a queue', async () => {
    const event = new IdentityWasCreatedEvent('identity-id');

    database.findOne.mockResolvedValue(undefined);

    await expect(repository.hasProcessed(queueName, event)).resolves.toBe(
      false,
    );
  });

  it('should mark a domain event as processed by a queue', async () => {
    const event = new IdentityWasCreatedEvent('identity-id');

    await repository.markAsProcessed(queueName, event);

    expect(database.save).toHaveBeenCalledWith(
      'processed_domain_events',
      `${queueName}:${event.eventId}`,
      {
        aggregateId: event.aggregateId,
        eventId: event.eventId,
        eventName: event.eventName(),
        processedAt: expect.any(Number),
        queueName,
      },
    );
  });
});
