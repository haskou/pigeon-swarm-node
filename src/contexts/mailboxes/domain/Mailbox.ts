import { MailboxAppendRateLimitedError } from './errors/MailboxAppendRateLimitedError';
import { MailboxFullError } from './errors/MailboxFullError';
import { MailboxLastReaderError } from './errors/MailboxLastReaderError';
import { MailboxReaderLimitReachedError } from './errors/MailboxReaderLimitReachedError';
import { MailboxReaderNotFoundError } from './errors/MailboxReaderNotFoundError';
import { MailboxCapability } from './MailboxCapability';
import MailboxPolicy from './MailboxPolicy';
import {
  MailboxPrimitives,
  MailboxReaderPrimitives,
} from './MailboxPrimitives';

/**
 * Queue owned by one receiving relationship direction. It stores no identity,
 * conversation or participant: only capability hashes, reader acknowledgements and counters.
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
      readers: [{ ackedCursor: 0, readTokenHash: params.readTokenHash }],
    });
  }

  public static fromPrimitives(primitives: MailboxPrimitives): Mailbox {
    return new Mailbox({
      ...primitives,
      readers: primitives.readers.map((reader) => ({ ...reader })),
    });
  }

  private constructor(private primitives: MailboxPrimitives) {}

  public acceptsPost(token: string): boolean {
    return MailboxCapability.matches(token, this.primitives.postTokenHash);
  }

  public acceptsRead(token: string): boolean {
    return this.readerFor(token) !== undefined;
  }

  /**
   * Records that the reader holding `token` has processed everything up to
   * `upTo`. The cursor only moves forward and never past the newest envelope.
   * Returns false when no reader holds the token.
   */
  public acknowledge(token: string, upTo: number): boolean {
    const reader = this.readerFor(token);

    if (!reader) {
      return false;
    }

    reader.ackedCursor = Math.max(
      reader.ackedCursor,
      Math.min(upTo, this.highestCursor()),
    );

    return true;
  }

  /**
   * Adds a reader with nothing acknowledged, so it receives the retained
   * backlog. Returns false when the hash already belongs to a reader.
   */
  public addReader(readTokenHash: string, policy: MailboxPolicy): boolean {
    if (this.hasReader(readTokenHash)) {
      return false;
    }

    if (this.primitives.readers.length >= policy.maxReaders()) {
      throw new MailboxReaderLimitReachedError();
    }

    this.primitives.readers.push({ ackedCursor: 0, readTokenHash });

    return true;
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
      this.hasReader(readTokenHash)
    );
  }

  public hasReader(readTokenHash: string): boolean {
    return this.primitives.readers.some(
      (reader) => reader.readTokenHash === readTokenHash,
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

  /** Copies, so reader state only changes through this entity. */
  public readers(): MailboxReaderPrimitives[] {
    return this.primitives.readers.map((reader) => ({ ...reader }));
  }

  /**
   * Revokes one reader. The last reader cannot be revoked: a mailbox with no
   * reader could never be read or settled again.
   */
  public removeReader(readTokenHash: string): void {
    const index = this.primitives.readers.findIndex(
      (reader) => reader.readTokenHash === readTokenHash,
    );

    if (index === -1) {
      throw new MailboxReaderNotFoundError();
    }

    if (this.primitives.readers.length === 1) {
      throw new MailboxLastReaderError();
    }

    this.primitives.readers.splice(index, 1);
  }

  /**
   * The cursor every reader has acknowledged. Envelopes at or below it can be
   * deleted. Zero with no readers, so nothing is deleted.
   */
  public settledCursor(): number {
    const cursors = this.primitives.readers.map((reader) => reader.ackedCursor);

    return cursors.length === 0 ? 0 : Math.min(...cursors);
  }

  public toPrimitives(): MailboxPrimitives {
    return { ...this.primitives, readers: this.readers() };
  }

  /**
   * Scans every reader so the timing does not reveal which one matched.
   */
  private readerFor(token: string): MailboxReaderPrimitives | undefined {
    let match: MailboxReaderPrimitives | undefined;

    for (const reader of this.primitives.readers) {
      if (MailboxCapability.matches(token, reader.readTokenHash)) {
        match = reader;
      }
    }

    return match;
  }
}
