import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Operator-configurable bounds, read per call. None of them uses a user identifier. */
export default class MailboxPolicy {
  /**
   * Envelope bodies must be exactly one of these decoded sizes. Clients pad up
   * to the next bucket, so the node only ever sees a few distinct sizes.
   */
  public static readonly SIZE_BUCKETS = [1024, 4096, 16384, 65536];

  public static readonly MAX_PAGE = 100;

  public isAllowedBodySize(size: number): boolean {
    return MailboxPolicy.SIZE_BUCKETS.includes(size);
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
