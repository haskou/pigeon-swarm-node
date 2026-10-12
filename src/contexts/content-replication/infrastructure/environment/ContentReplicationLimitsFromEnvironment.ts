import { ContentReplicationLimits } from '@app/contexts/content-replication/domain/ContentReplicationLimits';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Reads the per-identity replication bounds, falling back to the domain defaults. */
export class ContentReplicationLimitsFromEnvironment {
  public static load(): ContentReplicationLimits {
    const environment = pigeonEnvironment();
    const quotaBytes = environment.CONTENT_REPLICATION_QUOTA_BYTES;
    const maxRecords = environment.CONTENT_REPLICATION_MAX_RECORDS_PER_IDENTITY;

    return new ContentReplicationLimits(
      Number.isSafeInteger(quotaBytes) && quotaBytes > 0
        ? quotaBytes
        : ContentReplicationLimits.DEFAULT_QUOTA_BYTES,
      Number.isSafeInteger(maxRecords) && maxRecords > 0
        ? maxRecords
        : ContentReplicationLimits.DEFAULT_MAX_RECORDS,
    );
  }
}
