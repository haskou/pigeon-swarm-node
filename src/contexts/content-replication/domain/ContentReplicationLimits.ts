import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** What one identity may ask the network to hold for it, per network. */
export class ContentReplicationLimits {
  public static readonly DEFAULT_MAX_RECORDS = 10_000;
  public static readonly DEFAULT_QUOTA_BYTES = 1024 ** 3;

  public static fromEnvironment(
    environment = pigeonEnvironment(),
  ): ContentReplicationLimits {
    const positive = (value: number, fallback: number): number =>
      Number.isSafeInteger(value) && value > 0 ? value : fallback;

    return new ContentReplicationLimits(
      positive(
        environment.CONTENT_REPLICATION_QUOTA_BYTES,
        ContentReplicationLimits.DEFAULT_QUOTA_BYTES,
      ),
      positive(
        environment.CONTENT_REPLICATION_MAX_RECORDS_PER_IDENTITY,
        ContentReplicationLimits.DEFAULT_MAX_RECORDS,
      ),
    );
  }

  constructor(
    public readonly quotaBytes: number,
    public readonly maxRecords: number,
  ) {}
}
