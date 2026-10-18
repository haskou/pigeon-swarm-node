import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import clientRateKey from '@app/shared/infrastructure/express/clientRateKey';
import {
  PublicKey,
  Signature,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

import { SignedRequestReplayEntry } from './SignedRequestReplayEntry';

/**
 * The signatures this node accepted inside their validity window, kept in
 * memory only: another node, or this node after a restart, does not know them.
 * Every signer holds at most SLOTS_PER_SIGNER live entries. Each client address
 * (an IPv6 /64 counting as one) holds at most SERVED_SLOTS_PER_SOURCE entries of
 * the signers this node serves, and of the STRANGER_SLOTS shared by signers it
 * does not serve, at most STRANGER_SLOTS_PER_SOURCE. So neither one signer nor
 * one source can fill the guard for the identities and devices it serves, and
 * one source cannot fill the stranger share for every other source. Sources
 * spread over many addresses can still fill MAX_ENTRIES: that residual is
 * accepted, as the guard fails closed rather than evicting live entries.
 */
export class SignedRequestReplayGuard {
  private static readonly MAX_ENTRIES = 100_000;
  private static readonly SLOTS_PER_SIGNER = 1_000;
  private static readonly STRANGER_SLOTS = 10_000;
  /**
   * A fortieth of the stranger share, so filling it takes 40 client addresses
   * (or IPv6 /64s), while one address still has room for its identity
   * creations (30 a minute by default) and for many clients behind one
   * carrier NAT or proxy.
   */
  private static readonly STRANGER_SLOTS_PER_SOURCE = 250;

  private readonly entryBySignature = new Map<
    string,
    SignedRequestReplayEntry
  >();

  private readonly slotsBySigner = new Map<string, number>();
  private readonly servedSlotsBySource = new Map<string, number>();
  private readonly strangerSlotsBySource = new Map<string, number>();
  private strangerSlots = 0;
  private servedSlotsPerSourceLimit?: number;

  private static take(slots: Map<string, number>, key: string): void {
    slots.set(key, (slots.get(key) ?? 0) + 1);
  }

  private static give(slots: Map<string, number>, key: string): void {
    const left = (slots.get(key) ?? 1) - 1;

    if (left === 0) {
      slots.delete(key);
    } else {
      slots.set(key, left);
    }
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entryBySignature) {
      if (entry.expiration > now) {
        break;
      }

      this.entryBySignature.delete(key);
      this.release(entry);
    }
  }

  private release(entry: SignedRequestReplayEntry): void {
    SignedRequestReplayGuard.give(this.slotsBySigner, entry.signer);

    if (entry.stranger) {
      SignedRequestReplayGuard.give(this.strangerSlotsBySource, entry.source);
      this.strangerSlots -= 1;
    } else {
      SignedRequestReplayGuard.give(this.servedSlotsBySource, entry.source);
    }
  }

  /**
   * The served cap per client address, from SERVED_SLOTS_PER_SOURCE. It is read
   * on first use, because this singleton is built when the module loads, before
   * the kernel has loaded the environment.
   */
  private servedSlotLimit(): number {
    this.servedSlotsPerSourceLimit ??=
      pigeonEnvironment().SERVED_SLOTS_PER_SOURCE;

    return this.servedSlotsPerSourceLimit;
  }

  private hasRoomFor(
    signer: string,
    source: string,
    stranger: boolean,
  ): boolean {
    return (
      this.entryBySignature.size < SignedRequestReplayGuard.MAX_ENTRIES &&
      (this.slotsBySigner.get(signer) ?? 0) <
        SignedRequestReplayGuard.SLOTS_PER_SIGNER &&
      this.hasRoomForSource(source, stranger)
    );
  }

  private hasRoomForSource(source: string, stranger: boolean): boolean {
    if (!stranger) {
      return (
        (this.servedSlotsBySource.get(source) ?? 0) < this.servedSlotLimit()
      );
    }

    return (
      this.strangerSlots < SignedRequestReplayGuard.STRANGER_SLOTS &&
      (this.strangerSlotsBySource.get(source) ?? 0) <
        SignedRequestReplayGuard.STRANGER_SLOTS_PER_SOURCE
    );
  }

  private record(
    signer: PublicKey,
    signature: Signature,
    source: string,
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
      !this.hasRoomFor(signerKey, source, stranger)
    ) {
      return false;
    }

    this.entryBySignature.set(key, {
      expiration: now + SignedHttpRequestSignature.REPLAY_WINDOW_MS,
      signer: signerKey,
      source,
      stranger,
    });
    SignedRequestReplayGuard.take(this.slotsBySigner, signerKey);

    if (stranger) {
      SignedRequestReplayGuard.take(this.strangerSlotsBySource, source);
      this.strangerSlots += 1;
    } else {
      SignedRequestReplayGuard.take(this.servedSlotsBySource, source);
    }

    return true;
  }

  /**
   * Records a signature of a signer this node serves (an identity it holds,
   * an authorized device or the recovery authority of an identity) that
   * already passed signature and freshness checks, charged to `clientAddress`
   * against SERVED_SLOTS_PER_SOURCE. Returns false when the same signature was
   * accepted before inside its validity window, i.e. the request is a replay.
   * The entry is keyed by the raw bytes of the signing key, whichever role it
   * signed in, so a re-encoded key or a key that signs as both identity and
   * device gets no fresh slot. A signer that is not one canonical key is
   * refused outright. When the signer, its source or the guard is full it
   * fails closed and rejects new signatures: live entries are never evicted,
   * so an attacker cannot flush an intercepted signature out of the guard to
   * replay it.
   */
  public accept(
    signer: PublicKey,
    signature: Signature,
    clientAddress: string,
  ): boolean {
    return this.record(signer, signature, clientRateKey(clientAddress), false);
  }

  /**
   * Records a signature like accept, for a signer this node does not serve,
   * such as a key creating its identity here, sent from `clientAddress`. Such
   * signers share a bounded part of the guard, of which each client address
   * holds a bounded part, and are refused once either is full. The address is
   * kept in memory only, with its entry: an expired entry is dropped when the
   * guard next records a signature.
   */
  public acceptFromStranger(
    signer: PublicKey,
    signature: Signature,
    clientAddress: string,
  ): boolean {
    return this.record(signer, signature, clientRateKey(clientAddress), true);
  }
}

export const signedRequestReplayGuard = new SignedRequestReplayGuard();
