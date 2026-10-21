import { DeviceAuthorizationTransitionRateLimitExceededError } from './errors/DeviceAuthorizationTransitionRateLimitExceededError';

/**
 * A small node-wide window for sealing-view reads of identities this node does
 * not hold. It keeps no per-target state, so random ids cannot evict the
 * budgets of known targets, and it never limits a known target.
 */
export default class DeviceSealingViewUnknownRateLimiter {
  public static readonly WINDOW_MS = 60_000;
  public static readonly LIMIT = 300;
  private count = 0;
  private resetAt = 0;

  public consume(now = Date.now()): void {
    if (this.resetAt <= now) {
      this.count = 0;
      this.resetAt = now + DeviceSealingViewUnknownRateLimiter.WINDOW_MS;
    }

    this.count += 1;

    if (this.count > DeviceSealingViewUnknownRateLimiter.LIMIT) {
      throw new DeviceAuthorizationTransitionRateLimitExceededError();
    }
  }
}
