import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { LinkPreviewRateLimitExceededError } from '../errors/LinkPreviewRateLimitExceededError';
import { LinkPreviewRatePolicy } from './LinkPreviewRatePolicy';

export default class LinkPreviewRateLimiter {
  private static readonly NAMESPACE = 'link_preview_rate_limits';
  private static readonly CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
  private static nextCleanupAt = 0;

  private readonly policy: LinkPreviewRatePolicy =
    LinkPreviewRatePolicy.fromEnvironment();

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private async cleanupExpiredBuckets(now: number): Promise<void> {
    if (now < LinkPreviewRateLimiter.nextCleanupAt) {
      return;
    }

    LinkPreviewRateLimiter.nextCleanupAt =
      now + LinkPreviewRateLimiter.CLEANUP_INTERVAL_MS;

    await this.database.deleteMany(
      LinkPreviewRateLimiter.NAMESPACE,
      (document) =>
        typeof document.resetAt === 'number' && document.resetAt <= now,
    );
  }

  private id(identityId: IdentityId, ipAddress: string): string {
    return `${identityId.valueOf()}:${ipAddress}`;
  }

  private nextBucket(
    current: Record<string, unknown> | undefined,
    now: number,
  ): { count: number; resetAt: number } {
    const currentResetAt =
      typeof current?.resetAt === 'number' ? current.resetAt : undefined;
    const currentCount =
      typeof current?.count === 'number' ? current.count : undefined;

    if (!currentCount || !currentResetAt || currentResetAt <= now) {
      return {
        count: 1,
        resetAt: now + LinkPreviewRatePolicy.WINDOW_MS,
      };
    }

    return {
      count: currentCount + 1,
      resetAt: currentResetAt,
    };
  }

  public async consume(
    identityId: IdentityId,
    ipAddress: string,
  ): Promise<void> {
    if (this.policy.getLimit() === 0) {
      return;
    }

    const id = this.id(identityId, ipAddress);
    const now = Date.now();

    await this.cleanupExpiredBuckets(now);

    const current = await this.database.findOne(
      LinkPreviewRateLimiter.NAMESPACE,
      id,
    );
    const bucket = this.nextBucket(current, now);

    await this.database.save(LinkPreviewRateLimiter.NAMESPACE, id, {
      count: bucket.count,
      resetAt: bucket.resetAt,
    });

    if (bucket.count > this.policy.getLimit()) {
      throw new LinkPreviewRateLimitExceededError(this.policy.getLimit());
    }
  }
}
