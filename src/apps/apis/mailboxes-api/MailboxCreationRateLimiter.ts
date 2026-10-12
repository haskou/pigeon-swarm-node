import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import ClientRateWindows from '@app/shared/infrastructure/express/ClientRateWindows';

import { MailboxCreationRateLimitExceededError } from './errors/MailboxCreationRateLimitExceededError';

/**
 * Per client cap on mailbox creation, keyed by client address (see
 * ClientRateWindows). Held in memory only.
 */
export default class MailboxCreationRateLimiter {
  private static readonly WINDOW_MS = 60_000;

  private readonly windows = new ClientRateWindows(
    MailboxCreationRateLimiter.WINDOW_MS,
  );

  /** A limit of 0 disables the cap. */
  public consume(address: string, now: number = Date.now()): void {
    const limit = pigeonEnvironment().MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE;

    if (limit === 0) {
      return;
    }

    if (this.windows.charge(address, now) > limit) {
      throw new MailboxCreationRateLimitExceededError(limit);
    }
  }
}
