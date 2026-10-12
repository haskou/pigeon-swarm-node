import { MailboxLimits } from './MailboxLimits';

/** Operator-configurable bounds, bound by composition. None of them uses a user identifier. */
export default class MailboxPolicy {
  /**
   * Envelope bodies must be exactly one of these decoded sizes. Clients pad up
   * to the next bucket, so the node only ever sees a few distinct sizes.
   */
  public static readonly SIZE_BUCKETS = [1024, 4096, 16384, 65536];

  public static readonly MAX_PAGE = 100;

  /** Empty and unread for this long: only such mailboxes may be evicted at capacity. */
  public static readonly EVICTION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(private readonly limits: MailboxLimits) {}

  public isAllowedBodySize(size: number): boolean {
    return MailboxPolicy.SIZE_BUCKETS.includes(size);
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

  public retentionMs(): number {
    return this.limits.retentionMs;
  }
}
