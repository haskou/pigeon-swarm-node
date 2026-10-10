import { randomUUID } from 'crypto';

import { PrivateBlobCapability } from './PrivateBlobCapability';
import { PrivateBlobPrimitives } from './PrivateBlobPrimitives';

/**
 * Temporary storage record for one client-encrypted blob. It holds no
 * filename, content type, key or thumbnail: the server only sees an opaque
 * size and two capabilities.
 */
export class PrivateBlob {
  public static fromPrimitives(primitives: PrivateBlobPrimitives): PrivateBlob {
    return new PrivateBlob({ ...primitives });
  }

  public static reserve(params: {
    now: number;
    ownerKey: string;
    retentionMs: number;
    size: number;
    uploadWindowMs: number;
  }): { blob: PrivateBlob; downloadToken: string; uploadToken: string } {
    const upload = PrivateBlobCapability.generate();
    const download = PrivateBlobCapability.generate();
    const uploadDeadline = params.now + params.uploadWindowMs;

    return {
      blob: new PrivateBlob({
        createdAt: params.now,
        downloadTokenHash: download.hash,
        expiresAt: uploadDeadline,
        id: randomUUID(),
        ownerKey: params.ownerKey,
        retentionMs: params.retentionMs,
        size: params.size,
        state: 'reserved',
        uploadTokenHash: upload.hash,
      }),
      downloadToken: download.token,
      uploadToken: upload.token,
    };
  }

  private constructor(private primitives: PrivateBlobPrimitives) {}

  public acceptsDownload(token: string): boolean {
    return (
      this.primitives.state === 'stored' &&
      PrivateBlobCapability.matches(token, this.primitives.downloadTokenHash)
    );
  }

  public acceptsUpload(token: string): boolean {
    return PrivateBlobCapability.matches(
      token,
      this.primitives.uploadTokenHash,
    );
  }

  public getExpiresAt(): number {
    return this.primitives.expiresAt;
  }

  public getId(): string {
    return this.primitives.id;
  }

  public getOwnerKey(): string {
    return this.primitives.ownerKey;
  }

  public getSize(): number {
    return this.primitives.size;
  }

  public isExpired(now: number): boolean {
    return this.primitives.expiresAt <= now;
  }

  public isStored(): boolean {
    return this.primitives.state === 'stored';
  }

  /** From now on the blob lives for the retention window and is immutable. */
  public markStored(now: number): void {
    this.primitives = {
      ...this.primitives,
      expiresAt: now + this.primitives.retentionMs,
      state: 'stored',
    };
  }

  public toPrimitives(): PrivateBlobPrimitives {
    return { ...this.primitives };
  }
}
