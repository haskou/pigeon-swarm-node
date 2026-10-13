import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import FixedWindowCounter from '@app/shared/infrastructure/local-db/FixedWindowCounter';

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

    const count = await FixedWindowCounter.increment(
      this.database,
      IdentityPublishRateLimiter.NAMESPACE,
      identityId.valueOf(),
      IdentityPublishRateLimiter.WINDOW_MS,
    );

    if (count > limit) throw new IdentityPublishRateLimitExceededError(limit);
  }
}
