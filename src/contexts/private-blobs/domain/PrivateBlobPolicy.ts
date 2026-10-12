import { PrivateBlobLimits } from './PrivateBlobLimits';

/** Operator-configurable bounds, bound by composition. */
export default class PrivateBlobPolicy {
  constructor(private readonly limits: PrivateBlobLimits) {}

  public maxBytes(): number {
    return this.limits.maxBytes;
  }

  public ownerQuotaBytes(): number {
    return this.limits.ownerQuotaBytes;
  }

  public retentionMs(): number {
    // A blob must outlive every mailbox envelope that may reference it.
    return Math.max(
      this.limits.blobRetentionMs,
      this.limits.mailboxRetentionMs,
    );
  }

  public totalQuotaBytes(): number {
    return this.limits.totalQuotaBytes;
  }

  public uploadWindowMs(): number {
    return this.limits.uploadWindowMs;
  }
}
