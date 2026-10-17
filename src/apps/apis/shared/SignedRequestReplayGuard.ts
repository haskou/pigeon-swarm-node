import {
  PublicKey,
  Signature,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

export class SignedRequestReplayGuard {
  private static readonly MAX_ENTRIES = 100_000;

  private readonly expirationBySignature = new Map<string, number>();

  private prune(now: number): void {
    for (const [key, expiration] of this.expirationBySignature) {
      if (expiration > now) {
        break;
      }

      this.expirationBySignature.delete(key);
    }
  }

  /**
   * Records a signature that already passed signature and freshness checks.
   * Returns false when the same signature was accepted before inside its
   * validity window, i.e. the request is a replay. The entry is keyed by the
   * raw bytes of the signing key, whichever role it signed in, so a re-encoded
   * key or a key that signs as both identity and device gets no fresh slot. A
   * signer that is not one canonical key is refused outright. At capacity it
   * fails closed and rejects new signatures: live entries are never evicted,
   * so an attacker cannot flush an intercepted signature out of the guard to
   * replay it.
   */
  public accept(signer: PublicKey, signature: Signature): boolean {
    const now = Date.now();
    let key: string;

    try {
      key = SignedHttpRequestSignature.replayKey(
        Buffer.from(signer.toRaw()).toString('base64'),
        signature,
      );
    } catch {
      return false;
    }

    this.prune(now);

    if (this.expirationBySignature.has(key)) {
      return false;
    }

    if (
      this.expirationBySignature.size >= SignedRequestReplayGuard.MAX_ENTRIES
    ) {
      return false;
    }

    this.expirationBySignature.set(
      key,
      now + SignedHttpRequestSignature.REPLAY_WINDOW_MS,
    );

    return true;
  }
}

export const signedRequestReplayGuard = new SignedRequestReplayGuard();
