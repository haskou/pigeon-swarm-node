import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { NotificationRecordRateLimitExceededError } from './errors/NotificationRecordRateLimitExceededError';

/** Caps the replicated notification records one identity may author per minute. */
export default class NotificationRecordRateLimiter {
  public static readonly DEFAULT_LIMIT_PER_MINUTE = 30;
  public static readonly WINDOW_MS = 60_000;
  private static readonly NAMESPACE = 'notification_record_rate_limits';

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private limit(): number {
    const configured = pigeonEnvironment().NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE;

    return Number.isFinite(configured) && configured >= 0
      ? configured
      : NotificationRecordRateLimiter.DEFAULT_LIMIT_PER_MINUTE;
  }

  /** A limit of 0 disables the cap. */
  public async consume(identityId: IdentityId): Promise<void> {
    const limit = this.limit();

    if (limit === 0) return;

    const id = identityId.valueOf();
    const now = Date.now();
    const current = await this.database.findOne(
      NotificationRecordRateLimiter.NAMESPACE,
      id,
    );
    const live =
      typeof current?.resetAt === 'number' &&
      current.resetAt > now &&
      typeof current.count === 'number';
    const count = live ? (current.count as number) + 1 : 1;
    const resetAt = live
      ? (current.resetAt as number)
      : now + NotificationRecordRateLimiter.WINDOW_MS;

    await this.database.save(NotificationRecordRateLimiter.NAMESPACE, id, {
      count,
      resetAt,
    });

    if (count > limit) throw new NotificationRecordRateLimitExceededError(limit);
  }
}
