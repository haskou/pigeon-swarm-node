export type CallSignalRateBucket = {
  count: number;
  resetAt: number;
};

export class CallSignalRatePolicy {
  public static readonly DEFAULT_LIMIT_PER_MINUTE = 120;
  public static readonly WINDOW_MS = 60_000;

  public static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): CallSignalRatePolicy {
    const parsedLimit = Number(environment.CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE);

    return new CallSignalRatePolicy(
      Number.isFinite(parsedLimit) && parsedLimit >= 0
        ? parsedLimit
        : CallSignalRatePolicy.DEFAULT_LIMIT_PER_MINUTE,
    );
  }

  constructor(private readonly limit: number) {}

  public getLimit(): number {
    return this.limit;
  }

  public consume(
    bucket: CallSignalRateBucket | undefined,
    now: number,
  ): { allowed: boolean; bucket: CallSignalRateBucket } {
    if (this.limit === 0) {
      return {
        allowed: true,
        bucket: {
          count: bucket?.count || 0,
          resetAt: bucket?.resetAt || now + CallSignalRatePolicy.WINDOW_MS,
        },
      };
    }

    if (!bucket || bucket.resetAt <= now) {
      return {
        allowed: true,
        bucket: {
          count: 1,
          resetAt: now + CallSignalRatePolicy.WINDOW_MS,
        },
      };
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
