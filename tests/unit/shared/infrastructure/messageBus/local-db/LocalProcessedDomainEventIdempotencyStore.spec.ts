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

  it('should claim a message that has not been processed', async () => {
    database.findOne.mockResolvedValue(undefined);

    await expect(store.claim(key)).resolves.toBe(true);
    expect(database.findOne).toHaveBeenCalledWith(
      'processed_domain_events',
      key,
    );
  });

  it('should not claim a message that was already committed', async () => {
    database.findOne.mockResolvedValue({ _id: key, processedAt: 1 });

    await expect(store.claim(key)).resolves.toBe(false);

    database.findOne.mockResolvedValue(undefined);
    await expect(store.claim(key)).resolves.toBe(true);
  });

  it('should grant only one of concurrent claims', async () => {
    database.findOne.mockResolvedValue(undefined);

    const results = await Promise.all([store.claim(key), store.claim(key)]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('should allow a new claim after release', async () => {
    database.findOne.mockResolvedValue(undefined);
    await store.claim(key);

    store.release(key);

    await expect(store.claim(key)).resolves.toBe(true);
    expect(database.save).not.toHaveBeenCalled();
  });

  it('should persist a committed message and keep it claimed out', async () => {
    database.findOne.mockResolvedValue(undefined);
    await store.claim(key);

    await store.commit(key);

    expect(database.save).toHaveBeenCalledWith(
      'processed_domain_events',
      key,
      { processedAt: expect.any(Number) },
    );
    expect(database.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      database.save.mock.invocationCallOrder[0],
    );
    database.findOne.mockResolvedValue({ _id: key, processedAt: 1 });
    await expect(store.claim(key)).resolves.toBe(false);
  });

  it('should free the claim when persisting fails', async () => {
    database.findOne.mockResolvedValue(undefined);
    await store.claim(key);
    database.save.mockRejectedValue(new Error('disk'));

    await expect(store.commit(key)).rejects.toThrow('disk');

    await expect(store.claim(key)).resolves.toBe(true);
  });
});
