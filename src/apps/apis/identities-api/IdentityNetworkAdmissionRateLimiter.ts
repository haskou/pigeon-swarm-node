import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import FixedWindowCounter from '@app/shared/infrastructure/local-db/FixedWindowCounter';

import { IdentityNetworkAdmissionRateLimitExceededError } from './errors/IdentityNetworkAdmissionRateLimitExceededError';

/**
 * Optionally caps the identity admissions this node accepts into each network
 * per minute. Off by default: a cap lets a flood through this node block
 * registrations there for the window. Counts are local to this node and are
 * not shared with peers.
 */
export default class IdentityNetworkAdmissionRateLimiter {
  private static readonly NAMESPACE = 'identity_network_admission_rate_limits';
  public static readonly DEFAULT_LIMIT_PER_MINUTE = 0;
  public static readonly WINDOW_MS = 60_000;

  constructor(private readonly database: EmbeddedLocalDatabase) {}

  private limit(): number {
    const configured =
      pigeonEnvironment().IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE;

    return Number.isFinite(configured) && configured >= 0
      ? configured
      : IdentityNetworkAdmissionRateLimiter.DEFAULT_LIMIT_PER_MINUTE;
  }

  /** Charges one admission to every listed network. A limit of 0 disables the cap. */
  public async consume(networkIds: string[]): Promise<void> {
    const limit = this.limit();

    if (limit === 0) return;

    let exceeded = false;

    for (const networkId of new Set(networkIds)) {
      const count = await FixedWindowCounter.increment(
        this.database,
        IdentityNetworkAdmissionRateLimiter.NAMESPACE,
        networkId,
        IdentityNetworkAdmissionRateLimiter.WINDOW_MS,
      );

      if (count > limit) exceeded = true;
    }

    if (exceeded) {
      throw new IdentityNetworkAdmissionRateLimitExceededError(limit);
    }
  }
}
