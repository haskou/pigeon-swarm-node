import { Duration } from '@haskou/value-objects';

/** Operator-configured private blob bounds, bound by composition. */
export class PrivateBlobLimits {
  constructor(
    public readonly maxBytes: number,
    public readonly ownerQuotaBytes: number,
    public readonly totalQuotaBytes: number,
    public readonly uploadWindow: Duration,
    public readonly blobRetention: Duration,
    public readonly mailboxRetention: Duration,
  ) {}
}
