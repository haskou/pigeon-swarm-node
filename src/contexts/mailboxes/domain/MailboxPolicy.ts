import { Duration, Timestamp } from '@haskou/value-objects';

import { MailboxEnvelopeInvalidError } from './errors/MailboxEnvelopeInvalidError';
import { MailboxEnvelope } from './MailboxEnvelope';
import { MailboxLimits } from './MailboxLimits';

/** Operator-configurable bounds, bound by composition. None of them uses a user identifier. */
export default class MailboxPolicy {
  private static readonly BASE64URL = /^[A-Za-z0-9_-]+$/;

  /**
   * Envelope bodies must be exactly one of these decoded sizes. Clients pad up
   * to the next bucket, so the node only ever sees a few distinct sizes.
   */
  public static readonly SIZE_BUCKETS = [1024, 4096, 16384, 65536];

  public static readonly MAX_PAGE = 100;

  /** Empty and unread for this long: only such mailboxes may be evicted at capacity. */
  public static readonly EVICTION_IDLE = Duration.fromDays(7);

  constructor(private readonly limits: MailboxLimits) {}

  /**
   * Decoded size of a base64url body. Throws unless the body is base64url
   * and its decoded size is one of the buckets.
   */
  public decodedBodySize(body: string): number {
    if (!MailboxPolicy.BASE64URL.test(body)) {
      throw new MailboxEnvelopeInvalidError(MailboxPolicy.SIZE_BUCKETS);
    }

    const size = Buffer.from(body, 'base64url').length;

    if (!MailboxPolicy.SIZE_BUCKETS.includes(size)) {
      throw new MailboxEnvelopeInvalidError(MailboxPolicy.SIZE_BUCKETS);
    }

    return size;
  }

  /** Envelopes whose retention has ended by `now`. */
  public expiredEnvelopes(
    envelopes: MailboxEnvelope[],
    now: Timestamp,
  ): MailboxEnvelope[] {
    const retention = this.retention();

    return envelopes.filter((envelope) =>
      new Timestamp(envelope.storedAt)
        .addDuration(retention)
        .isBeforeOrEqual(now),
    );
  }

  public maxAppendsPerMinute(): number {
    return this.limits.maxAppendsPerMinute;
  }

  public maxBytesPerMailbox(): number {
    return this.limits.maxBytesPerMailbox;
  }

  public maxEnvelopesPerMailbox(): number {
    return this.limits.maxEnvelopesPerMailbox;
  }

  public maxMailboxes(): number {
    return this.limits.maxMailboxes;
  }

  public maxReaders(): number {
    return this.limits.maxReaders;
  }

  public retention(): Duration {
    return this.limits.retention;
  }
}
