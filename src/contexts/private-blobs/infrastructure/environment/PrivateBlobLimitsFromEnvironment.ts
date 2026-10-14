import { PrivateBlobLimits } from '@app/contexts/private-blobs/domain/PrivateBlobLimits';
import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { Duration } from '@haskou/value-objects';

/** Reads the operator-configured private blob bounds from the process environment. */
export class PrivateBlobLimitsFromEnvironment {
  public static load(): PrivateBlobLimits {
    const environment = pigeonEnvironment();

    return new PrivateBlobLimits(
      environment.PRIVATE_BLOB_MAX_BYTES,
      environment.PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER,
      environment.PRIVATE_BLOB_QUOTA_BYTES_TOTAL,
      Duration.fromMilliseconds(environment.PRIVATE_BLOB_UPLOAD_WINDOW_MS),
      Duration.fromMilliseconds(environment.PRIVATE_BLOB_RETENTION_MS),
      Duration.fromMilliseconds(environment.MAILBOX_RETENTION_MS),
    );
  }
}
