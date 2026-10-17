import clientRateKey from './clientRateKey';

/**
 * Fixed windows of charges per client address, keyed by `clientRateKey`. Held
 * in memory only: remote addresses are never written to disk, and a restart
 * merely resets the windows.
 */
export default class ClientRateWindows {
  private static readonly MAX_TRACKED = 10_000;

  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly windowMs: number) {}

  private prune(now: number): void {
    for (const [address, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(address);
      }
    }
  }

  public get size(): number {
    return this.windows.size;
  }

  /** Test seam: forgets every window. */
  public reset(): void {
    this.windows.clear();
  }

  /** Charges one event to the client address and returns its count in the current window. */
  public charge(address: string, now: number): number {
    if (this.windows.size >= ClientRateWindows.MAX_TRACKED) {
      this.prune(now);
    }

    const key = clientRateKey(address);
    const current = this.windows.get(key);
    const live = current !== undefined && current.resetAt > now;
    const next = live
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + this.windowMs };

    this.windows.set(key, next);

    return next.count;
  }
}
