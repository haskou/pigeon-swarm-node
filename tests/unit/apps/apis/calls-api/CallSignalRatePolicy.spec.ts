import { CallSignalRatePolicy } from '@app/apps/apis/calls-api/CallSignalRatePolicy';

describe('CallSignalRatePolicy', () => {
  it('should reject signals over the configured window limit', () => {
    const policy = new CallSignalRatePolicy(2);
    const first = policy.consume(undefined, 1000);
    const second = policy.consume(first.bucket, 2000);
    const third = policy.consume(second.bucket, 3000);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.bucket).toEqual({
      count: 2,
      resetAt: 61000,
    });
  });

  it('should reset the bucket after the rate window expires', () => {
    const policy = new CallSignalRatePolicy(1);
    const first = policy.consume(undefined, 1000);
    const second = policy.consume(first.bucket, 61000);

    expect(second).toEqual({
      allowed: true,
      bucket: {
        count: 1,
        resetAt: 121000,
      },
    });
  });
});
