import { PrivateBlobQuotaExceededError } from './errors/PrivateBlobQuotaExceededError';
import { PrivateBlobSizeInvalidError } from './errors/PrivateBlobSizeInvalidError';
import { PrivateBlobLimits } from './PrivateBlobLimits';

/** Operator-configurable bounds, bound by composition. */
export default class PrivateBlobPolicy {
  constructor(private readonly limits: PrivateBlobLimits) {}

  /** Sizes outside `1..maxBytes` are refused before any repository read. */
  public assertSizeAllowed(size: number): void {
    if (!Number.isSafeInteger(size) || size < 1 || size > this.maxBytes()) {
      throw new PrivateBlobSizeInvalidError(this.maxBytes());
    }
  }

  /** Refuses a reservation that would exceed the total or the owner's quota. */
  public assertQuotaAllowed(
    size: number,
    reservedTotal: number,
    reservedByOwner: number,
  ): void {
    if (
      reservedTotal + size > this.totalQuotaBytes() ||
      reservedByOwner + size > this.ownerQuotaBytes()
    ) {
      throw new PrivateBlobQuotaExceededError();
    }
  }

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
