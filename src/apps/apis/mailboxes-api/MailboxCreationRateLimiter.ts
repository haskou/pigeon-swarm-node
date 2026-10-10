import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import { MailboxCreationRateLimitExceededError } from './errors/MailboxCreationRateLimitExceededError';

/**
 * Per remote address cap on mailbox creation. Held in memory only: remote
 * addresses are never written to disk, and a restart merely resets the window.
 */
export default class MailboxCreationRateLimiter {
  private static readonly MAX_TRACKED = 10_000;
  private static readonly WINDOW_MS = 60_000;

  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  private prune(now: number): void {
    for (const [address, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(address);
      }
    }
  }

  /** A limit of 0 disables the cap. */
  public consume(address: string, now: number = Date.now()): void {
    const limit = pigeonEnvironment().MAILBOX_CREATE_RATE_LIMIT_PER_MINUTE;

    if (limit === 0) {
      return;
    }

    if (this.windows.size >= MailboxCreationRateLimiter.MAX_TRACKED) {
      this.prune(now);
    }

    const current = this.windows.get(address);
    const live = current !== undefined && current.resetAt > now;
    const next = live
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + MailboxCreationRateLimiter.WINDOW_MS };

    this.windows.set(address, next);

    if (next.count > limit) {
      throw new MailboxCreationRateLimitExceededError(limit);
    }
  }
}
