/** Operator-configured private blob bounds, bound by composition. */
export class PrivateBlobLimits {
  constructor(
    public readonly maxBytes: number,
    public readonly ownerQuotaBytes: number,
    public readonly totalQuotaBytes: number,
    public readonly uploadWindowMs: number,
    public readonly blobRetentionMs: number,
    public readonly mailboxRetentionMs: number,
  ) {}
}
