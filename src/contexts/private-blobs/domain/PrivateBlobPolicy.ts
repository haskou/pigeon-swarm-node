import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

/** Operator-configurable bounds. Read per call so a restart is not needed in tests. */
export default class PrivateBlobPolicy {
  public maxBytes(): number {
    return pigeonEnvironment().PRIVATE_BLOB_MAX_BYTES;
  }

  public ownerQuotaBytes(): number {
    return pigeonEnvironment().PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER;
  }

  public retentionMs(): number {
    return pigeonEnvironment().PRIVATE_BLOB_RETENTION_MS;
  }

  public totalQuotaBytes(): number {
    return pigeonEnvironment().PRIVATE_BLOB_QUOTA_BYTES_TOTAL;
  }

  public uploadWindowMs(): number {
    return pigeonEnvironment().PRIVATE_BLOB_UPLOAD_WINDOW_MS;
  }
}
