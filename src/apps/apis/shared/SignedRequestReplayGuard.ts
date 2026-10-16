import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
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
   * validity window, i.e. the request is a replay. At capacity it fails closed
   * and rejects new signatures: live entries are never evicted, so an attacker
   * cannot flush an intercepted signature out of the guard to replay it.
   */
  public accept(identityId: IdentityId, signature: Signature): boolean {
    const now = Date.now();
    const key = SignedHttpRequestSignature.replayKey(
      identityId.valueOf(),
      signature,
    );

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
