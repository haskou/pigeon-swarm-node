type Window = { count: number; resetAt: number };

/**
 * Bounds WebSocket upgrade attempts per remote address and the number of
 * sockets the node keeps open. Runs before any signature verification.
 */
export class WebSocketAdmissionLimiter {
  public static readonly MAX_OPEN_SOCKETS = 2_000;
  public static readonly MAX_TRACKED_ADDRESSES = 10_000;
  public static readonly UPGRADES_PER_ADDRESS = 60;
  public static readonly WINDOW_MS = 60_000;

  private readonly addresses = new Map<string, Window>();

  private evictExpired(now: number): void {
    if (this.addresses.size < WebSocketAdmissionLimiter.MAX_TRACKED_ADDRESSES) {
      return;
    }

    this.addresses.forEach((window, key) => {
      if (window.resetAt <= now) {
        this.addresses.delete(key);
      }
    });
  }

  public admit(
    remoteAddress: string,
    openSockets: number,
    now = Date.now(),
  ): boolean {
    const limiter = WebSocketAdmissionLimiter;

    if (openSockets >= limiter.MAX_OPEN_SOCKETS) {
      return false;
    }

    this.evictExpired(now);
    const current = this.addresses.get(remoteAddress);

    if (!current && this.addresses.size >= limiter.MAX_TRACKED_ADDRESSES) {
      return false;
    }

    const window =
      current && current.resetAt > now
        ? { count: current.count + 1, resetAt: current.resetAt }
        : { count: 1, resetAt: now + limiter.WINDOW_MS };

    this.addresses.set(remoteAddress, window);

    return window.count <= limiter.UPGRADES_PER_ADDRESS;
  }
}
