import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { IdentityPublishRateLimitExceededError } from './errors/IdentityPublishRateLimitExceededError';

/** Caps the identity versions one identity may publish through this node per minute. */
export default class IdentityPublishRateLimiter {
  private static readonly NAMESPACE = 'identity_publish_rate_limits';
  public static readonly DEFAULT_LIMIT_PER_MINUTE = 30;
  public static readonly WINDOW_MS = 60_000;

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private limit(): number {
    const configured =
      pigeonEnvironment().IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE;

    return Number.isFinite(configured) && configured >= 0
      ? configured
      : IdentityPublishRateLimiter.DEFAULT_LIMIT_PER_MINUTE;
  }

  /** A limit of 0 disables the cap. */
  public async consume(identityId: IdentityId): Promise<void> {
    const limit = this.limit();

    if (limit === 0) return;

    const id = identityId.valueOf();
    const now = Date.now();
    const current = await this.database.findOne(
      IdentityPublishRateLimiter.NAMESPACE,
      id,
    );
    const live =
      typeof current?.resetAt === 'number' &&
      current.resetAt > now &&
      typeof current.count === 'number';
    const count = live ? (current.count as number) + 1 : 1;
    const resetAt = live
      ? (current.resetAt as number)
      : now + IdentityPublishRateLimiter.WINDOW_MS;

    await this.database.save(IdentityPublishRateLimiter.NAMESPACE, id, {
      count,
      resetAt,
    });

    if (count > limit) throw new IdentityPublishRateLimitExceededError(limit);
  }
}
