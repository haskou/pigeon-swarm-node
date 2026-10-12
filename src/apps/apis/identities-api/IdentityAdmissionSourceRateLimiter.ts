import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import ClientRateWindows from '@app/shared/infrastructure/express/ClientRateWindows';

import { IdentityAdmissionSourceRateLimitExceededError } from './errors/IdentityAdmissionSourceRateLimitExceededError';

/**
 * Caps the identity admissions one client address may submit to this node per
 * minute. It is charged before the per-identity and per-network limits, so a
 * source that floods this node is refused without using up the budgets that
 * every other source shares. Held in memory only.
 */
export default class IdentityAdmissionSourceRateLimiter {
  private static readonly WINDOW_MS = 60_000;

  private readonly windows = new ClientRateWindows(
    IdentityAdmissionSourceRateLimiter.WINDOW_MS,
  );

  /** A limit of 0 disables the cap. */
  public consume(address: string, now: number = Date.now()): void {
    const limit =
      pigeonEnvironment().IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE;

    if (limit === 0) {
      return;
    }

    if (this.windows.charge(address, now) > limit) {
      throw new IdentityAdmissionSourceRateLimitExceededError(limit);
    }
  }

  /** Test seam: forgets every window so scenarios start from zero. */
  public reset(): void {
    this.windows.reset();
  }
}
