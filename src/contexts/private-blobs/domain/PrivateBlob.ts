import { Timestamp } from '@haskou/value-objects';

import { PrivateBlobCapability } from './PrivateBlobCapability';
import { PrivateBlobPrimitives } from './PrivateBlobPrimitives';
import { PrivateBlobState } from './PrivateBlobState';
import { PrivateBlobDownloadToken } from './value-objects/PrivateBlobDownloadToken';
import { PrivateBlobId } from './value-objects/PrivateBlobId';
import { PrivateBlobSize } from './value-objects/PrivateBlobSize';
import { PrivateBlobStatus } from './value-objects/PrivateBlobStatus';
import { PrivateBlobUploadToken } from './value-objects/PrivateBlobUploadToken';

/**
 * Temporary storage record for one client-encrypted blob. It holds no
 * filename, content type, key or thumbnail: the server only sees an opaque
 * size and two capabilities.
 */
export class PrivateBlob {
  public static fromPrimitives(primitives: PrivateBlobPrimitives): PrivateBlob {
    return new PrivateBlob({
      createdAt: new Timestamp(primitives.createdAt),
      downloadTokenHash: primitives.downloadTokenHash,
      expiresAt: new Timestamp(primitives.expiresAt),
      id: new PrivateBlobId(primitives.id),
      ownerKey: primitives.ownerKey,
      retentionMs: primitives.retentionMs,
      size: new PrivateBlobSize(primitives.size),
      status: PrivateBlobStatus.fromPrimitives(primitives.state),
      uploadTokenHash: primitives.uploadTokenHash,
    });
  }

  public static reserve(params: {
    id: PrivateBlobId;
    now: Timestamp;
    ownerKey: string;
    retentionMs: number;
    size: PrivateBlobSize;
    uploadWindowMs: number;
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
        downloadTokenHash: download.hash,
        expiresAt: params.now.addMilliseconds(params.uploadWindowMs),
        id: params.id,
        ownerKey: params.ownerKey,
        retentionMs: params.retentionMs,
        size: params.size,
        status: PrivateBlobStatus.RESERVED,
        uploadTokenHash: upload.hash,
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
        this.state.downloadTokenHash,
      )
    );
  }

  public acceptsUpload(token: PrivateBlobUploadToken): boolean {
    return PrivateBlobCapability.matches(
      token.valueOf(),
      this.state.uploadTokenHash,
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

  public isOwnedBy(ownerKey: string): boolean {
    return this.state.ownerKey === ownerKey;
  }

  /** Stored under a retention shorter than `retentionMs`. */
  public isStoredWithRetentionBelow(retentionMs: number): boolean {
    return this.isStored() && this.state.retentionMs < retentionMs;
  }

  public isStored(): boolean {
    return this.state.status.isStored();
  }

  /** From now on the blob lives for the retention window and is immutable. */
  public markStored(now: Timestamp): void {
    this.state.expiresAt = now.addMilliseconds(this.state.retentionMs);
    this.state.status = PrivateBlobStatus.STORED;
  }

  /**
   * Raises the retention of a stored blob. Its store time is kept, so the new
   * deadline is store time plus the new retention.
   */
  public extendRetentionTo(retentionMs: number): void {
    if (!this.isStoredWithRetentionBelow(retentionMs)) {
      return;
    }

    this.state.expiresAt = this.state.expiresAt.addMilliseconds(
      retentionMs - this.state.retentionMs,
    );
    this.state.retentionMs = retentionMs;
  }

  public toPrimitives(): PrivateBlobPrimitives {
    return {
      createdAt: this.state.createdAt.toMilliseconds(),
      downloadTokenHash: this.state.downloadTokenHash,
      expiresAt: this.state.expiresAt.toMilliseconds(),
      id: this.state.id.valueOf(),
      ownerKey: this.state.ownerKey,
      retentionMs: this.state.retentionMs,
      size: this.state.size.valueOf(),
      state: this.state.status.valueOf(),
      uploadTokenHash: this.state.uploadTokenHash,
    };
  }
}
