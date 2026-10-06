import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { CallRecordRateLimitExceededError } from './errors/CallRecordRateLimitExceededError';

/** Caps the signed call records one identity may author per minute. */
export default class CallRecordRateLimiter {
  private static readonly NAMESPACE = 'call_record_rate_limits';
  public static readonly DEFAULT_LIMIT_PER_MINUTE = 30;
  public static readonly WINDOW_MS = 60_000;

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private limit(): number {
    const configured = pigeonEnvironment().CALLS_RECORD_RATE_LIMIT_PER_MINUTE;

    return Number.isFinite(configured) && configured >= 0
      ? configured
      : CallRecordRateLimiter.DEFAULT_LIMIT_PER_MINUTE;
  }

  /** A limit of 0 disables the cap. */
  public async consume(identityId: IdentityId): Promise<void> {
    const limit = this.limit();

    if (limit === 0) return;

    const id = identityId.valueOf();
    const now = Date.now();
    const current = await this.database.findOne(
      CallRecordRateLimiter.NAMESPACE,
      id,
    );
    const live =
      typeof current?.resetAt === 'number' &&
      current.resetAt > now &&
      typeof current.count === 'number';
    const count = live ? (current.count as number) + 1 : 1;
    const resetAt = live
      ? (current.resetAt as number)
      : now + CallRecordRateLimiter.WINDOW_MS;

    await this.database.save(CallRecordRateLimiter.NAMESPACE, id, {
      count,
      resetAt,
    });

    if (count > limit) throw new CallRecordRateLimitExceededError(limit);
  }
}
