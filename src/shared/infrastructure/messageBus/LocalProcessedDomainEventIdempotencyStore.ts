import type { IdempotencyStore } from '@haskou/ddd-kernel/contracts/kernel';

import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

export default class LocalProcessedDomainEventIdempotencyStore implements IdempotencyStore {
  private static readonly NAMESPACE = 'processed_domain_events';
  private static readonly TTL_MS = 30 * 24 * 60 * 60 * 1000;
  private static readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  private static nextCleanupAt = 0;

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private cleanupExpiredRecordsInBackground(now: number): void {
    if (now < LocalProcessedDomainEventIdempotencyStore.nextCleanupAt) {
      return;
    }

    LocalProcessedDomainEventIdempotencyStore.nextCleanupAt =
      now + LocalProcessedDomainEventIdempotencyStore.CLEANUP_INTERVAL_MS;

    void Promise.resolve(
      this.database.deleteMany(
        LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
        (document) =>
          typeof document.processedAt === 'number' &&
          document.processedAt <
            now - LocalProcessedDomainEventIdempotencyStore.TTL_MS,
      ),
    ).catch((): undefined => undefined);
  }

  public async has(key: string): Promise<boolean> {
    const document = await this.database.findOne(
      LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
      key,
    );

    return document !== undefined;
  }

  public async mark(key: string): Promise<void> {
    const now = Date.now();

    this.cleanupExpiredRecordsInBackground(now);

    await this.database.save(
      LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
      key,
      {
        processedAt: now,
      },
    );
  }
}
