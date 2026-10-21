import { DeviceAuthorizationTransitionRateLimitExceededError } from './errors/DeviceAuthorizationTransitionRateLimitExceededError';

type Window = { count: number; resetAt: number };

export interface ClientAddressRateLimits {
  addressLimit: number;
  maxTrackedAddresses: number;
  windowMs: number;
}

/**
 * A fixed window per client address, in front of the per-identity and node
 * budgets: one address cannot spend what other addresses are allowed. The table
 * is in memory only and bounded: a full table evicts the oldest address, so a
 * flood of addresses weakens the limit for the evicted ones but never refuses
 * the others. Addresses are never logged nor persisted.
 */
export abstract class ClientAddressRateLimiter {
  private static readonly UNKNOWN_ADDRESS = 'unknown';
  private readonly addresses = new Map<string, Window>();

  protected constructor(private readonly limits: ClientAddressRateLimits) {}

  private evict(now: number): void {
    if (this.addresses.size < this.limits.maxTrackedAddresses) {
      return;
    }

    this.addresses.forEach((window, key) => {
      if (window.resetAt <= now) {
        this.addresses.delete(key);
      }
    });

    if (this.addresses.size >= this.limits.maxTrackedAddresses) {
      const oldest = this.addresses.keys().next();

      if (!oldest.done) {
        this.addresses.delete(oldest.value);
      }
    }
  }

  public consume(address: string | undefined, now = Date.now()): void {
    const key = address || ClientAddressRateLimiter.UNKNOWN_ADDRESS;
    const current = this.addresses.get(key);
    const window =
      current && current.resetAt > now
        ? { count: current.count + 1, resetAt: current.resetAt }
        : { count: 1, resetAt: now + this.limits.windowMs };

    if (!current) {
      this.evict(now);
    }

    this.addresses.set(key, window);

    if (window.count > this.limits.addressLimit) {
      throw new DeviceAuthorizationTransitionRateLimitExceededError();
    }
  }
}
