import type { IdempotencyStore } from '@haskou/ddd-kernel/contracts/kernel';

import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

export default class LocalProcessedDomainEventIdempotencyStore implements IdempotencyStore {
  private static readonly NAMESPACE = 'processed_domain_events';

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  public async has(key: string): Promise<boolean> {
    const document = await this.database.findOne(
      LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
      key,
    );

    return document !== undefined;
  }

  public async mark(key: string): Promise<void> {
    await this.database.save(
      LocalProcessedDomainEventIdempotencyStore.NAMESPACE,
      key,
      {
        processedAt: Date.now(),
      },
    );
  }
}
