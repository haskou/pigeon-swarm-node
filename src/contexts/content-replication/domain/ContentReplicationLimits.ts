/** What one identity may ask the network to hold for it, per network. */
export class ContentReplicationLimits {
  public static readonly DEFAULT_MAX_RECORDS = 10_000;
  public static readonly DEFAULT_QUOTA_BYTES = 1024 ** 3;

  constructor(
    public readonly quotaBytes: number,
    public readonly maxRecords: number,
  ) {}
}
