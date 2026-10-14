import { Duration, Timestamp } from '@haskou/value-objects';

import { PrivateBlobCapability } from './PrivateBlobCapability';
import { PrivateBlobPrimitives } from './PrivateBlobPrimitives';
import { PrivateBlobState } from './PrivateBlobState';
import { PrivateBlobDownloadToken } from './value-objects/PrivateBlobDownloadToken';
import { PrivateBlobDownloadTokenHash } from './value-objects/PrivateBlobDownloadTokenHash';
import { PrivateBlobId } from './value-objects/PrivateBlobId';
import { PrivateBlobOwnerKey } from './value-objects/PrivateBlobOwnerKey';
import { PrivateBlobSize } from './value-objects/PrivateBlobSize';
import { PrivateBlobStatus } from './value-objects/PrivateBlobStatus';
import { PrivateBlobUploadToken } from './value-objects/PrivateBlobUploadToken';
import { PrivateBlobUploadTokenHash } from './value-objects/PrivateBlobUploadTokenHash';

/**
 * Temporary storage record for one client-encrypted blob. It holds no
 * filename, content type, key or thumbnail: the server only sees an opaque
 * size and two capabilities.
 */
export class PrivateBlob {
  public static fromPrimitives(primitives: PrivateBlobPrimitives): PrivateBlob {
    return new PrivateBlob({
      createdAt: new Timestamp(primitives.createdAt),
      downloadTokenHash: new PrivateBlobDownloadTokenHash(
        primitives.downloadTokenHash,
      ),
      expiresAt: new Timestamp(primitives.expiresAt),
      id: new PrivateBlobId(primitives.id),
      ownerKey: new PrivateBlobOwnerKey(primitives.ownerKey),
      retention: Duration.fromMilliseconds(primitives.retentionMs),
      size: new PrivateBlobSize(primitives.size),
      status: PrivateBlobStatus.fromPrimitives(primitives.state),
      uploadTokenHash: new PrivateBlobUploadTokenHash(
        primitives.uploadTokenHash,
      ),
    });
  }

  public static reserve(params: {
    id: PrivateBlobId;
    now: Timestamp;
    ownerKey: PrivateBlobOwnerKey;
    retention: Duration;
    size: PrivateBlobSize;
    uploadWindow: Duration;
  }): {
    blob: PrivateBlob;
    downloadToken: PrivateBlobDownloadToken;
    uploadToken: PrivateBlobUploadToken;
  } {
    const upload = PrivateBlobCapability.generate();
    const download = PrivateBlobCapability.generate();

    return {
      blob: new PrivateBlob({
        createdAt: params.now,
        downloadTokenHash: new PrivateBlobDownloadTokenHash(download.hash),
        expiresAt: params.now.addDuration(params.uploadWindow),
        id: params.id,
        ownerKey: params.ownerKey,
        retention: params.retention,
        size: params.size,
        status: PrivateBlobStatus.RESERVED,
        uploadTokenHash: new PrivateBlobUploadTokenHash(upload.hash),
      }),
      downloadToken: new PrivateBlobDownloadToken(download.token),
      uploadToken: new PrivateBlobUploadToken(upload.token),
    };
  }

  private constructor(private readonly state: PrivateBlobState) {}

  public acceptsDownload(token: PrivateBlobDownloadToken): boolean {
    return (
      this.isStored() &&
      PrivateBlobCapability.matches(
        token.valueOf(),
        this.state.downloadTokenHash.valueOf(),
      )
    );
  }

  public acceptsUpload(token: PrivateBlobUploadToken): boolean {
    return PrivateBlobCapability.matches(
      token.valueOf(),
      this.state.uploadTokenHash.valueOf(),
    );
  }

  public getExpiresAt(): Timestamp {
    return this.state.expiresAt;
  }

  public getId(): PrivateBlobId {
    return this.state.id;
  }

  public getSize(): PrivateBlobSize {
    return this.state.size;
  }

  public isExpired(now: Timestamp): boolean {
    return this.state.expiresAt.isBeforeOrEqual(now);
  }

  public isOwnedBy(ownerKey: PrivateBlobOwnerKey): boolean {
    return this.state.ownerKey.isEqual(ownerKey);
  }

  /** Stored under a retention shorter than `retention`. */
  public isStoredWithRetentionBelow(retention: Duration): boolean {
    return this.isStored() && this.state.retention.isLessThan(retention);
  }

  public isStored(): boolean {
    return this.state.status.isStored();
  }

  /** From now on the blob lives for the retention window and is immutable. */
  public markStored(now: Timestamp): void {
    this.state.expiresAt = now.addDuration(this.state.retention);
    this.state.status = PrivateBlobStatus.STORED;
  }

  /**
   * Raises the retention of a stored blob. Its store time is kept, so the new
   * deadline is store time plus the new retention.
   */
  public extendRetentionTo(retention: Duration): void {
    if (!this.isStoredWithRetentionBelow(retention)) {
      return;
    }

    this.state.expiresAt = this.state.expiresAt.addMilliseconds(
      retention.subtract(this.state.retention),
    );
    this.state.retention = retention;
  }

  public toPrimitives(): PrivateBlobPrimitives {
    return {
      createdAt: this.state.createdAt.toMilliseconds(),
      downloadTokenHash: this.state.downloadTokenHash.valueOf(),
      expiresAt: this.state.expiresAt.toMilliseconds(),
      id: this.state.id.valueOf(),
      ownerKey: this.state.ownerKey.valueOf(),
      retentionMs: this.state.retention.valueOf(),
      size: this.state.size.valueOf(),
      state: this.state.status.valueOf(),
      uploadTokenHash: this.state.uploadTokenHash.valueOf(),
    };
  }
}
