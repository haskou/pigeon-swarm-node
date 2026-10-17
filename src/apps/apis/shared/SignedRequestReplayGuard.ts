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
 * Every signer holds at most SLOTS_PER_SIGNER live entries and signers this
 * node does not serve share STRANGER_SLOTS, of which one client address (an
 * IPv6 /64 counting as one) holds at most STRANGER_SLOTS_PER_SOURCE. So
 * neither one signer nor a crowd of self-made keys can fill the guard for the
 * identities and devices it serves, and one source cannot fill the stranger
 * share for every other source.
 */
export class SignedRequestReplayGuard {
  private static readonly MAX_ENTRIES = 100_000;
  private static readonly SLOTS_PER_SIGNER = 1_000;
  private static readonly STRANGER_SLOTS = 10_000;
  private static readonly STRANGER_SLOTS_PER_SOURCE = 1_000;

  private readonly entryBySignature = new Map<
    string,
    SignedRequestReplayEntry
  >();

  private readonly slotsBySigner = new Map<string, number>();
  private readonly strangerSlotsBySource = new Map<string, number>();
  private strangerSlots = 0;

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

    if (entry.strangerSource !== undefined) {
      SignedRequestReplayGuard.give(
        this.strangerSlotsBySource,
        entry.strangerSource,
      );
      this.strangerSlots -= 1;
    }
  }

  private hasRoomForStranger(source: string | undefined): boolean {
    return (
      source === undefined ||
      (this.strangerSlots < SignedRequestReplayGuard.STRANGER_SLOTS &&
        (this.strangerSlotsBySource.get(source) ?? 0) <
          SignedRequestReplayGuard.STRANGER_SLOTS_PER_SOURCE)
    );
  }

  private hasRoomFor(signer: string, strangerSource?: string): boolean {
    return (
      this.entryBySignature.size < SignedRequestReplayGuard.MAX_ENTRIES &&
      (this.slotsBySigner.get(signer) ?? 0) <
        SignedRequestReplayGuard.SLOTS_PER_SIGNER &&
      this.hasRoomForStranger(strangerSource)
    );
  }

  private record(
    signer: PublicKey,
    signature: Signature,
    strangerSource?: string,
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
      !this.hasRoomFor(signerKey, strangerSource)
    ) {
      return false;
    }

    this.entryBySignature.set(key, {
      expiration: now + SignedHttpRequestSignature.REPLAY_WINDOW_MS,
      signer: signerKey,
      strangerSource,
    });
    SignedRequestReplayGuard.take(this.slotsBySigner, signerKey);

    if (strangerSource !== undefined) {
      SignedRequestReplayGuard.take(this.strangerSlotsBySource, strangerSource);
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
    return this.record(signer, signature);
  }

  /**
   * Records a signature like accept, for a signer this node does not serve,
   * such as a key creating its identity here, sent from `clientAddress`. Such
   * signers share a bounded part of the guard, of which each client address
   * holds a bounded part, and are refused once either is full. The address is
   * kept in memory for the validity window only.
   */
  public acceptFromStranger(
    signer: PublicKey,
    signature: Signature,
    clientAddress: string,
  ): boolean {
    return this.record(signer, signature, clientRateKey(clientAddress));
  }
}

export const signedRequestReplayGuard = new SignedRequestReplayGuard();
