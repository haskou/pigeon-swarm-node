import { Duration } from '@haskou/value-objects';

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

  public retention(): Duration {
    // A blob must outlive every mailbox envelope that may reference it.
    const { blobRetention, mailboxRetention } = this.limits;

    return blobRetention.isGreaterThan(mailboxRetention)
      ? blobRetention
      : mailboxRetention;
  }

  public totalQuotaBytes(): number {
    return this.limits.totalQuotaBytes;
  }

  public uploadWindow(): Duration {
    return this.limits.uploadWindow;
  }
}
