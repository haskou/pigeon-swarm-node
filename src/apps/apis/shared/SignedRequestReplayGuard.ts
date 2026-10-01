export class SignedRequestReplayGuard {
  private static readonly MAX_ENTRIES = 100_000;
  public static readonly MAX_CLOCK_SKEW_MS = 30 * 1000;

  private readonly expirationBySignature = new Map<string, number>();

  private prune(now: number): void {
    for (const [key, expiration] of this.expirationBySignature) {
      if (expiration > now) {
        break;
      }

      this.expirationBySignature.delete(key);
    }

    while (
      this.expirationBySignature.size >= SignedRequestReplayGuard.MAX_ENTRIES
    ) {
      const oldest = this.expirationBySignature.keys().next();

      if (oldest.done) {
        return;
      }

      this.expirationBySignature.delete(oldest.value);
    }
  }

  /**
   * Records a signature that already passed signature and freshness checks.
   * Returns false when the same signature was accepted before inside its
   * validity window, i.e. the request is a replay.
   */
  public accept(identityId: string, signature: string): boolean {
    const now = Date.now();
    const key = `${identityId}:${signature}`;

    this.prune(now);

    if (this.expirationBySignature.has(key)) {
      return false;
    }

    this.expirationBySignature.set(
      key,
      now + SignedRequestReplayGuard.MAX_CLOCK_SKEW_MS * 2,
    );

    return true;
  }
}

export const signedRequestReplayGuard = new SignedRequestReplayGuard();
