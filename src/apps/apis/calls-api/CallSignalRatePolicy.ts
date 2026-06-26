import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import { CallSignalRateBucket } from './CallSignalRateBucket';

export { CallSignalRateBucket } from './CallSignalRateBucket';

export class CallSignalRatePolicy {
  public static readonly DEFAULT_LIMIT_PER_MINUTE = 120;
  public static readonly WINDOW_MS = 60_000;

  public static fromEnvironment(
    environment = pigeonEnvironment(),
  ): CallSignalRatePolicy {
    const parsedLimit = environment.CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE;

    return new CallSignalRatePolicy(
      Number.isFinite(parsedLimit) && parsedLimit >= 0
        ? parsedLimit
        : CallSignalRatePolicy.DEFAULT_LIMIT_PER_MINUTE,
    );
  }

  constructor(private readonly limit: number) {}

  private consumeNewBucket(now: number): {
    allowed: boolean;
    bucket: CallSignalRateBucket;
  } {
    return {
      allowed: true,
      bucket: {
        count: 1,
        resetAt: now + CallSignalRatePolicy.WINDOW_MS,
      },
    };
  }

  private consumeWithoutLimit(
    bucket: CallSignalRateBucket | undefined,
    now: number,
  ): { allowed: boolean; bucket: CallSignalRateBucket } {
    return {
      allowed: true,
      bucket: {
        count: bucket?.count || 0,
        resetAt: bucket?.resetAt || now + CallSignalRatePolicy.WINDOW_MS,
      },
    };
  }

  private shouldResetBucket(
    bucket: CallSignalRateBucket | undefined,
    now: number,
  ): boolean {
    return !bucket || bucket.resetAt <= now;
  }

  public getLimit(): number {
    return this.limit;
  }

  public consume(
    bucket: CallSignalRateBucket | undefined,
    now: number,
  ): { allowed: boolean; bucket: CallSignalRateBucket } {
    if (this.limit === 0) {
      return this.consumeWithoutLimit(bucket, now);
    }

    if (this.shouldResetBucket(bucket, now)) {
      return this.consumeNewBucket(now);
    }

    if (bucket.count >= this.limit) {
      return {
        allowed: false,
        bucket,
      };
    }

    return {
      allowed: true,
      bucket: {
        count: bucket.count + 1,
        resetAt: bucket.resetAt,
      },
    };
  }
}
