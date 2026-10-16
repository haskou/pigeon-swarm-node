import { BearerCapability } from '@haskou/pigeon-swarm-crypto';
import { Duration, Timestamp } from '@haskou/value-objects';

import { MailboxAppendRateLimitedError } from './errors/MailboxAppendRateLimitedError';
import { MailboxConflictError } from './errors/MailboxConflictError';
import { MailboxFullError } from './errors/MailboxFullError';
import { MailboxLastReaderError } from './errors/MailboxLastReaderError';
import { MailboxLimitReachedError } from './errors/MailboxLimitReachedError';
import { MailboxReaderLimitReachedError } from './errors/MailboxReaderLimitReachedError';
import { MailboxReaderNotFoundError } from './errors/MailboxReaderNotFoundError';
import { MailboxEnvelope } from './MailboxEnvelope';
import MailboxPolicy from './MailboxPolicy';
import { MailboxPrimitives } from './MailboxPrimitives';
import { MailboxReaderCursor } from './MailboxReaderCursor';
import { MailboxState } from './MailboxState';
import { MailboxCursor } from './value-objects/MailboxCursor';
import { MailboxId } from './value-objects/MailboxId';
import { MailboxPostToken } from './value-objects/MailboxPostToken';
import { MailboxPostTokenHash } from './value-objects/MailboxPostTokenHash';
import { MailboxReadToken } from './value-objects/MailboxReadToken';
import { MailboxReadTokenHash } from './value-objects/MailboxReadTokenHash';

/**
 * Queue owned by one receiving relationship direction. It stores no identity,
 * conversation or participant: only capability hashes, reader acknowledgements and counters.
 */
export class Mailbox {
  public static create(params: {
    id: MailboxId;
    now: Timestamp;
    postTokenHash: MailboxPostTokenHash;
    readTokenHash: MailboxReadTokenHash;
    appendTokens: number;
    firstCursor: MailboxCursor;
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
      readers: [MailboxReaderCursor.start(params.readTokenHash)],
    });
  }

  public static fromPrimitives(primitives: MailboxPrimitives): Mailbox {
    return new Mailbox({
      appendRefilledAt: new Timestamp(primitives.appendRefilledAt),
      appendTokens: primitives.appendTokens,
      bytes: primitives.bytes,
      createdAt: new Timestamp(primitives.createdAt),
      envelopeCount: primitives.envelopeCount,
      id: new MailboxId(primitives.id),
      lastReadAt: new Timestamp(primitives.lastReadAt),
      nextCursor: new MailboxCursor(primitives.nextCursor),
      postTokenHash: new MailboxPostTokenHash(primitives.postTokenHash),
      readers: primitives.readers.map((reader) =>
        MailboxReaderCursor.fromPrimitives(reader),
      ),
    });
  }

  /**
   * Picks the victims for `needed` freed slots: the least recently read
   * mailboxes that are empty and idle. All or nothing: with too few such
   * mailboxes nothing is picked and the creation is refused.
   */
  public static selectEvictions(
    mailboxes: Mailbox[],
    now: Timestamp,
    needed: number,
  ): Mailbox[] {
    const candidates = mailboxes
      .filter((mailbox) =>
        mailbox.isIdleAndEmpty(now, MailboxPolicy.EVICTION_IDLE),
      )
      .sort((a, b) => {
        if (a.state.lastReadAt.isBefore(b.state.lastReadAt)) {
          return -1;
        }

        return b.state.lastReadAt.isBefore(a.state.lastReadAt) ? 1 : 0;
      });

    if (candidates.length < needed) {
      throw new MailboxLimitReachedError();
    }

    return candidates.slice(0, needed);
  }

  private constructor(private readonly state: MailboxState) {}

  /**
   * Scans every reader so the timing does not reveal which one matched.
   */
  private readerFor(token: MailboxReadToken): MailboxReaderCursor | undefined {
    let match: MailboxReaderCursor | undefined;

    for (const reader of this.state.readers) {
      if (reader.acceptsRead(token)) {
        match = reader;
      }
    }

    return match;
  }

  public acceptsPost(token: MailboxPostToken): boolean {
    return BearerCapability.verify(
      token.valueOf(),
      this.state.postTokenHash.valueOf(),
    );
  }

  public acceptsRead(token: MailboxReadToken): boolean {
    return this.readerFor(token) !== undefined;
  }

  /**
   * Records that the reader holding `token` has processed everything up to
   * `upTo`. The cursor only moves forward and never past the newest envelope.
   * Returns false when no reader holds the token.
   */
  public acknowledge(token: MailboxReadToken, upTo: MailboxCursor): boolean {
    const reader = this.readerFor(token);

    if (!reader) {
      return false;
    }

    reader.acknowledge(upTo, this.highestCursor());

    return true;
  }

  /**
   * Adds a reader with nothing acknowledged, so it receives the retained
   * backlog. Returns false when the hash already belongs to a reader.
   */
  public addReader(
    readTokenHash: MailboxReadTokenHash,
    policy: MailboxPolicy,
  ): boolean {
    if (this.hasReader(readTokenHash)) {
      return false;
    }

    if (this.state.readers.length >= policy.maxReaders()) {
      throw new MailboxReaderLimitReachedError();
    }

    this.state.readers.push(MailboxReaderCursor.start(readTokenHash));

    return true;
  }

  public getId(): MailboxId {
    return this.state.id;
  }

  /** Throws unless the hashes match: a repeated create must carry the same ones. */
  public requireHashes(
    postTokenHash: MailboxPostTokenHash,
    readTokenHash: MailboxReadTokenHash,
  ): void {
    if (
      !this.state.postTokenHash.isEqual(postTokenHash) ||
      !this.hasReader(readTokenHash)
    ) {
      throw new MailboxConflictError();
    }
  }

  public hasReader(readTokenHash: MailboxReadTokenHash): boolean {
    return this.state.readers.some((reader) => reader.holds(readTokenHash));
  }

  public highestCursor(): MailboxCursor {
    return this.state.nextCursor.previous();
  }

  /** Unread for the whole retention window: the mailbox itself is removed. */
  public isExpired(now: Timestamp, policy: MailboxPolicy): boolean {
    return this.state.lastReadAt
      .addDuration(policy.retention())
      .isBeforeOrEqual(now);
  }

  /** Empty and unread for `idle`: the only mailboxes eviction may remove. */
  public isIdleAndEmpty(now: Timestamp, idle: Duration): boolean {
    return (
      this.state.envelopeCount === 0 &&
      this.state.lastReadAt.addDuration(idle).isBeforeOrEqual(now)
    );
  }

  public markRead(now: Timestamp): void {
    this.state.lastReadAt = now;
  }

  /** Never drops older envelopes: past a limit the append fails. */
  public reserveEnvelope(size: number, policy: MailboxPolicy): MailboxCursor {
    if (
      this.state.envelopeCount + 1 > policy.maxEnvelopesPerMailbox() ||
      this.state.bytes + size > policy.maxBytesPerMailbox()
    ) {
      throw new MailboxFullError();
    }

    const cursor = this.state.nextCursor;

    this.state.nextCursor = cursor.next();
    this.state.envelopeCount += 1;
    this.state.bytes += size;

    return cursor;
  }

  /**
   * Token bucket for accepted envelopes: refills at the per-minute policy
   * rate, capped at one minute of appends. The state lives on the mailbox, so
   * a restart does not reset it. A refused append leaves the state untouched.
   */
  public consumeAppend(now: Timestamp, policy: MailboxPolicy): void {
    const perMinute = policy.maxAppendsPerMinute();

    if (perMinute === 0) {
      return;
    }

    const elapsedMs =
      now.toMilliseconds() - this.state.appendRefilledAt.toMilliseconds();
    const refilled =
      this.state.appendTokens + (Math.max(0, elapsedMs) * perMinute) / 60_000;
    const available = Math.min(perMinute, refilled);

    if (available < 1) {
      throw new MailboxAppendRateLimitedError();
    }

    this.state.appendTokens = available - 1;
    this.state.appendRefilledAt = now;
  }

  public releaseEnvelopes(removed: MailboxEnvelope[]): void {
    this.state.envelopeCount -= removed.length;
    this.state.bytes -= removed.reduce(
      (sum, envelope) => sum + envelope.size,
      0,
    );
  }

  /** Copies, so reader state only changes through this entity. */
  public readers(): MailboxReaderCursor[] {
    return this.state.readers.map((reader) => reader.copy());
  }

  /**
   * Revokes one reader. The last reader cannot be revoked: a mailbox with no
   * reader could never be read or settled again.
   */
  public removeReader(readTokenHash: MailboxReadTokenHash): void {
    const index = this.state.readers.findIndex((reader) =>
      reader.holds(readTokenHash),
    );

    if (index === -1) {
      throw new MailboxReaderNotFoundError();
    }

    if (this.state.readers.length === 1) {
      throw new MailboxLastReaderError();
    }

    this.state.readers.splice(index, 1);
  }

  /**
   * The cursor every reader has acknowledged. Envelopes at or below it can be
   * deleted. None with no readers, so nothing is deleted.
   */
  public settledCursor(): MailboxCursor {
    const [first, ...rest] = this.state.readers.map((reader) =>
      reader.getAckedCursor(),
    );

    if (!first) {
      return MailboxCursor.none();
    }

    return rest.reduce((lowest, cursor) => lowest.min(cursor), first);
  }

  public toPrimitives(): MailboxPrimitives {
    return {
      appendRefilledAt: this.state.appendRefilledAt.toMilliseconds(),
      appendTokens: this.state.appendTokens,
      bytes: this.state.bytes,
      createdAt: this.state.createdAt.toMilliseconds(),
      envelopeCount: this.state.envelopeCount,
      id: this.state.id.valueOf(),
      lastReadAt: this.state.lastReadAt.toMilliseconds(),
      nextCursor: this.state.nextCursor.valueOf(),
      postTokenHash: this.state.postTokenHash.valueOf(),
      readers: this.state.readers.map((reader) => reader.toPrimitives()),
    };
  }
}
