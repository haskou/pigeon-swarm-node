import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Operator-configurable bounds, read per call. None of them uses a user identifier. */
export default class MailboxPolicy {
  /**
   * Envelope bodies must be exactly one of these decoded sizes. Clients pad up
   * to the next bucket, so the node only ever sees a few distinct sizes.
   */
  public static readonly SIZE_BUCKETS = [1024, 4096, 16384, 65536];

  public static readonly MAX_PAGE = 100;

  /** Empty and unread for this long: only such mailboxes may be evicted at capacity. */
  public static readonly EVICTION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

  public isAllowedBodySize(size: number): boolean {
    return MailboxPolicy.SIZE_BUCKETS.includes(size);
  }

  public maxAppendsPerMinute(): number {
    return pigeonEnvironment().MAILBOX_APPEND_RATE_PER_MINUTE;
  }

  public maxBytesPerMailbox(): number {
    return pigeonEnvironment().MAILBOX_MAX_BYTES;
  }

  public maxEnvelopesPerMailbox(): number {
    return pigeonEnvironment().MAILBOX_MAX_ENVELOPES;
  }

  public maxMailboxes(): number {
    return pigeonEnvironment().MAILBOX_MAX_COUNT;
  }

  public retentionMs(): number {
    return pigeonEnvironment().MAILBOX_RETENTION_MS;
  }
}
