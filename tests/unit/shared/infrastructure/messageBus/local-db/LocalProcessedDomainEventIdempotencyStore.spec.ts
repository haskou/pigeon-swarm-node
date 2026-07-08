import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import LocalProcessedDomainEventIdempotencyStore from '@app/shared/infrastructure/messageBus/LocalProcessedDomainEventIdempotencyStore';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LocalProcessedDomainEventIdempotencyStore', () => {
  let database: MockProxy<EmbeddedLocalDatabase>;
  let store: LocalProcessedDomainEventIdempotencyStore;
  const key = 'pigeon-swarm.register-identity-when-published:event-id';

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    store = new LocalProcessedDomainEventIdempotencyStore(database);
    (
      LocalProcessedDomainEventIdempotencyStore as unknown as {
        nextCleanupAt: number;
      }
    ).nextCleanupAt = 0;
  });

  it('should know when a message has already been processed', async () => {
    database.findOne.mockResolvedValue({
      _id: key,
      processedAt: 1,
    });

    const result = await store.has(key);

    expect(result).toBe(true);
    expect(database.findOne).toHaveBeenCalledWith(
      'processed_domain_events',
      key,
    );
  });

  it('should know when a message has not been processed', async () => {
    database.findOne.mockResolvedValue(undefined);

    await expect(store.has(key)).resolves.toBe(false);
  });

  it('should mark a message as processed', async () => {
    await store.mark(key);

    expect(database.save).toHaveBeenCalledWith(
      'processed_domain_events',
      key,
      {
        processedAt: expect.any(Number),
      },
    );
    expect(database.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      database.save.mock.invocationCallOrder[0],
    );
  });
});
