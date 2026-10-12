import { MailboxAppendRateLimitedError } from './errors/MailboxAppendRateLimitedError';
import { MailboxFullError } from './errors/MailboxFullError';
import { MailboxCapability } from './MailboxCapability';
import MailboxPolicy from './MailboxPolicy';
import { MailboxPrimitives } from './MailboxPrimitives';

/**
 * Queue owned by one receiving relationship direction. It stores no identity,
 * conversation or participant: only two capability hashes and counters.
 */
export class Mailbox {
  public static create(params: {
    id: string;
    now: number;
    postTokenHash: string;
    readTokenHash: string;
    appendTokens: number;
    firstCursor: number;
  }): Mailbox {
    return new Mailbox({
      appendRefilledAt: params.now,
      appendTokens: params.appendTokens,
      bytes: 0,
      createdAt: params.now,
      envelopeCount: 0,
      id: params.id,
      lastReadAt: params.now,
      nextCursor: params.firstCursor,
      postTokenHash: params.postTokenHash,
      readTokenHash: params.readTokenHash,
    });
  }

  public static fromPrimitives(primitives: MailboxPrimitives): Mailbox {
    return new Mailbox({ ...primitives });
  }

  private constructor(private primitives: MailboxPrimitives) {}

  public acceptsPost(token: string): boolean {
    return MailboxCapability.matches(token, this.primitives.postTokenHash);
  }

  public acceptsRead(token: string): boolean {
    return MailboxCapability.matches(token, this.primitives.readTokenHash);
  }

  public getId(): string {
    return this.primitives.id;
  }

  public getLastReadAt(): number {
    return this.primitives.lastReadAt;
  }

  public hasHashes(postTokenHash: string, readTokenHash: string): boolean {
    return (
      this.primitives.postTokenHash === postTokenHash &&
      this.primitives.readTokenHash === readTokenHash
    );
  }

  public highestCursor(): number {
    return this.primitives.nextCursor - 1;
  }

  /** Empty and unread for `idleMs`: the only mailboxes eviction may remove. */
  public isIdleAndEmpty(now: number, idleMs: number): boolean {
    return (
      this.primitives.envelopeCount === 0 &&
      this.primitives.lastReadAt + idleMs <= now
    );
  }

  public markRead(now: number): void {
    this.primitives.lastReadAt = now;
  }

  /** Never drops older envelopes: past a limit the append fails. */
  public reserveEnvelope(size: number, policy: MailboxPolicy): number {
    if (
      this.primitives.envelopeCount + 1 > policy.maxEnvelopesPerMailbox() ||
      this.primitives.bytes + size > policy.maxBytesPerMailbox()
    ) {
      throw new MailboxFullError();
    }

    const cursor = this.primitives.nextCursor;

    this.primitives.nextCursor += 1;
    this.primitives.envelopeCount += 1;
    this.primitives.bytes += size;

    return cursor;
  }

  /**
   * Token bucket for accepted envelopes: refills at the per-minute policy
   * rate, capped at one minute of appends. The state lives on the mailbox, so
   * a restart does not reset it. A refused append leaves the state untouched.
   */
  public consumeAppend(now: number, policy: MailboxPolicy): void {
    const perMinute = policy.maxAppendsPerMinute();

    if (perMinute === 0) {
      return;
    }

    // Documents written before the bucket existed start with a full bucket.
    const stored = Number.isFinite(this.primitives.appendTokens)
      ? this.primitives.appendTokens
      : perMinute;
    const refilledAt = Number.isFinite(this.primitives.appendRefilledAt)
      ? this.primitives.appendRefilledAt
      : now;
    const refilled =
      stored + (Math.max(0, now - refilledAt) * perMinute) / 60_000;
    const available = Math.min(perMinute, refilled);

    if (available < 1) {
      throw new MailboxAppendRateLimitedError();
    }

    this.primitives.appendTokens = available - 1;
    this.primitives.appendRefilledAt = now;
  }

  public releaseEnvelopes(count: number, bytes: number): void {
    this.primitives.envelopeCount -= count;
    this.primitives.bytes -= bytes;
  }

  public toPrimitives(): MailboxPrimitives {
    return { ...this.primitives };
  }
}
