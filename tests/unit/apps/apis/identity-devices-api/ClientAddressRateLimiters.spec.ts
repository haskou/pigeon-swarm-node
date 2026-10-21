import DeviceAuthorizationTransitionClientRateLimiter from '@app/apps/apis/identity-devices-api/DeviceAuthorizationTransitionClientRateLimiter';
import DeviceAuthorizationTransitionReadRateLimiter from '@app/apps/apis/identity-devices-api/DeviceAuthorizationTransitionReadRateLimiter';
import DeviceSealingViewClientRateLimiter from '@app/apps/apis/identity-devices-api/DeviceSealingViewClientRateLimiter';
import DeviceSealingViewRateLimiter from '@app/apps/apis/identity-devices-api/DeviceSealingViewRateLimiter';

describe.each([
  [
    DeviceSealingViewClientRateLimiter,
    DeviceSealingViewRateLimiter.IDENTITY_LIMIT,
  ],
  [
    DeviceAuthorizationTransitionClientRateLimiter,
    DeviceAuthorizationTransitionReadRateLimiter.NODE_LIMIT,
  ],
])('%p', (Limiter, sharedBudget) => {
  const { ADDRESS_LIMIT, MAX_TRACKED_ADDRESSES, WINDOW_MS } = Limiter;

  it('rejects an address above its window limit and recovers after the window', () => {
    const limiter = new Limiter();

    for (let i = 0; i < ADDRESS_LIMIT; i++) limiter.consume('10.0.0.1', 1000);

    expect(() => limiter.consume('10.0.0.1', 1001)).toThrow(
      'Device authorization transition rate limit exceeded.',
    );
    expect(() => limiter.consume('10.0.0.1', 1000 + WINDOW_MS)).not.toThrow();
  });

  it('keeps one flooding address from limiting another', () => {
    const limiter = new Limiter();

    for (let i = 0; i <= ADDRESS_LIMIT * 3; i++) {
      try {
        limiter.consume('10.0.0.1', 1000);
      } catch {
        // the flooder is limited, that is the point
      }
    }

    expect(() => limiter.consume('10.0.0.2', 1000)).not.toThrow();
  });

  it('is stricter than the budget it protects, so one address cannot exhaust it', () => {
    expect(ADDRESS_LIMIT).toBeLessThan(sharedBudget);
  });

  it('keeps admitting new addresses once the table is full of live ones', () => {
    const limiter = new Limiter();

    for (let i = 0; i < MAX_TRACKED_ADDRESSES; i++) {
      limiter.consume(`filler-${i}`, 1000);
    }

    expect(() => limiter.consume('late-comer', 1000)).not.toThrow();
    expect(() => limiter.consume('late-comer', 1000)).not.toThrow();
  });

  it('serves a request without an address from a shared bucket instead of skipping the limit', () => {
    const limiter = new Limiter();

    for (let i = 0; i < ADDRESS_LIMIT; i++) limiter.consume(undefined, 1000);

    expect(() => limiter.consume(undefined, 1001)).toThrow();
  });
});
