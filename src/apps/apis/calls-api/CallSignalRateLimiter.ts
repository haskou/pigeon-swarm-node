import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';

import { CallSignalRatePolicy } from './CallSignalRatePolicy';
import { CallSignalRateLimitExceededError } from './errors/CallSignalRateLimitExceededError';

export default class CallSignalRateLimiter {
  private static readonly NAMESPACE = 'call_signal_rate_limits';

  private readonly policy: CallSignalRatePolicy =
    CallSignalRatePolicy.fromEnvironment();

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private id(callId: CallId, senderIdentityId: IdentityId): string {
    return `${callId.valueOf()}:${senderIdentityId.valueOf()}`;
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
        resetAt: now + CallSignalRatePolicy.WINDOW_MS,
      };
    }

    return {
      count: currentCount + 1,
      resetAt: currentResetAt,
    };
  }

  public async consume(
    callId: CallId,
    senderIdentityId: IdentityId,
  ): Promise<void> {
    if (this.policy.getLimit() === 0) {
      return;
    }

    const id = this.id(callId, senderIdentityId);
    const now = Date.now();
    const current = await this.database.findOne(
      CallSignalRateLimiter.NAMESPACE,
      id,
    );
    const bucket = this.nextBucket(current, now);

    await this.database.save(CallSignalRateLimiter.NAMESPACE, id, {
      count: bucket.count,
      resetAt: bucket.resetAt,
    });

    if (bucket.count > this.policy.getLimit()) {
      throw new CallSignalRateLimitExceededError(this.policy.getLimit());
    }
  }
}
