import {
  PublicKey,
  Signature,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

interface ReplayEntry {
  expiration: number;
  signer: string;
  stranger: boolean;
}

/**
 * The signatures this node accepted inside their validity window, kept in
 * memory only: another node, or this node after a restart, does not know them.
 * Every signer holds at most SLOTS_PER_SIGNER live entries and signers this
 * node does not hold share STRANGER_SLOTS, so neither one signer nor a crowd of
 * self-made keys can fill the guard for the identities and devices it serves.
 */
export class SignedRequestReplayGuard {
  private static readonly MAX_ENTRIES = 100_000;
  private static readonly SLOTS_PER_SIGNER = 1_000;
  private static readonly STRANGER_SLOTS = 10_000;

  private readonly entryBySignature = new Map<string, ReplayEntry>();
  private readonly slotsBySigner = new Map<string, number>();
  private strangerSlots = 0;

  private prune(now: number): void {
    for (const [key, entry] of this.entryBySignature) {
      if (entry.expiration > now) {
        break;
      }

      this.entryBySignature.delete(key);
      this.release(entry);
    }
  }

  private release(entry: ReplayEntry): void {
    const slots = (this.slotsBySigner.get(entry.signer) ?? 1) - 1;

    if (slots === 0) {
      this.slotsBySigner.delete(entry.signer);
    } else {
      this.slotsBySigner.set(entry.signer, slots);
    }

    if (entry.stranger) {
      this.strangerSlots -= 1;
    }
  }

  private hasRoomFor(signer: string, stranger: boolean): boolean {
    return (
      this.entryBySignature.size < SignedRequestReplayGuard.MAX_ENTRIES &&
      (this.slotsBySigner.get(signer) ?? 0) <
        SignedRequestReplayGuard.SLOTS_PER_SIGNER &&
      (!stranger ||
        this.strangerSlots < SignedRequestReplayGuard.STRANGER_SLOTS)
    );
  }

  private record(
    signer: PublicKey,
    signature: Signature,
    stranger: boolean,
  ): boolean {
    const now = Date.now();
    let signerKey: string;
    let key: string;

    try {
      signerKey = Buffer.from(signer.toRaw()).toString('base64');
      key = SignedHttpRequestSignature.replayKey(signerKey, signature);
    } catch {
      return false;
    }

    this.prune(now);

    if (
      this.entryBySignature.has(key) ||
      !this.hasRoomFor(signerKey, stranger)
    ) {
      return false;
    }

    this.entryBySignature.set(key, {
      expiration: now + SignedHttpRequestSignature.REPLAY_WINDOW_MS,
      signer: signerKey,
      stranger,
    });
    this.slotsBySigner.set(
      signerKey,
      (this.slotsBySigner.get(signerKey) ?? 0) + 1,
    );

    if (stranger) {
      this.strangerSlots += 1;
    }

    return true;
  }

  /**
   * Records a signature of a signer this node serves (an identity it holds,
   * an authorized device or the recovery authority of an identity) that
   * already passed signature and freshness checks. Returns false when the
   * same signature was accepted before inside its validity window, i.e. the
   * request is a replay. The entry is keyed by the raw bytes of the signing
   * key, whichever role it signed in, so a re-encoded key or a key that signs
   * as both identity and device gets no fresh slot. A signer that is not one
   * canonical key is refused outright. When the signer or the guard is full
   * it fails closed and rejects new signatures: live entries are never
   * evicted, so an attacker cannot flush an intercepted signature out of the
   * guard to replay it.
   */
  public accept(signer: PublicKey, signature: Signature): boolean {
    return this.record(signer, signature, false);
  }

  /**
   * Records a signature like accept, for a signer this node does not hold,
   * such as a key creating its identity here. Such signers share a bounded
   * part of the guard and are refused once it is full.
   */
  public acceptFromStranger(signer: PublicKey, signature: Signature): boolean {
    return this.record(signer, signature, true);
  }
}

export const signedRequestReplayGuard = new SignedRequestReplayGuard();
