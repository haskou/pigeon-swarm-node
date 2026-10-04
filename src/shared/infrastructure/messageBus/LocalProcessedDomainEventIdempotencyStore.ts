import type { IdempotencyStore } from '@haskou/ddd-kernel/contracts/kernel';

import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

export default class LocalProcessedDomainEventIdempotencyStore implements IdempotencyStore {
  private static readonly NAMESPACE = 'processed_domain_events';
  private static readonly TTL_MS = 30 * 24 * 60 * 60 * 1000;
  private static readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
  private static nextCleanupAt = 0;

  private readonly inFlight = new Set<string>();

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private async cleanupExpiredRecords(now: number): Promise<void> {
    if (now < LocalProcessedDomainEventIdempotencyStore.nextCleanupAt) {
      return;
    }

    LocalProcessedDomainEventIdempotencyStore.nextCleanupAt =
      now + LocalProcessedDomainEventIdempotencyStore.CLEANUP_INTERVAL_MS;

    await this.database.deleteMany(
      LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
      (document) =>
        typeof document.processedAt === 'number' &&
        document.processedAt <
          now - LocalProcessedDomainEventIdempotencyStore.TTL_MS,
    );
  }

  public async claim(key: string): Promise<boolean> {
    if (this.inFlight.has(key)) {
      return false;
    }

    this.inFlight.add(key);

    try {
      const processed = await this.database.findOne(
        LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
        key,
      );

      if (processed !== undefined) {
        this.inFlight.delete(key);

        return false;
      }
    } catch (error) {
      this.inFlight.delete(key);

      throw error;
    }

    return true;
  }

  public async commit(key: string): Promise<void> {
    const now = Date.now();

    try {
      await this.cleanupExpiredRecords(now);

      await this.database.save(
        LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
        key,
        {
          processedAt: now,
        },
      );
    } finally {
      this.inFlight.delete(key);
    }
  }

  public release(key: string): void {
    this.inFlight.delete(key);
  }
}
