import { Timestamp } from '@haskou/value-objects';

import { PrivateBlob } from '../PrivateBlob';
import { PrivateBlobId } from '../value-objects/PrivateBlobId';

export default abstract class PrivateBlobRepository {
  public abstract delete(id: PrivateBlobId): Promise<void>;

  /** Blobs whose deadline passed, reserved or stored. */
  public abstract findExpired(now: Timestamp): Promise<PrivateBlob[]>;

  /** Stored blobs whose retention is shorter than `retentionMs`. */
  public abstract findStoredRetainedBelow(
    retentionMs: number,
  ): Promise<PrivateBlob[]>;

  public abstract hasById(id: PrivateBlobId): Promise<boolean>;

  /** Rejects with PrivateBlobNotFoundError when the blob is absent. */
  public abstract requireById(id: PrivateBlobId): Promise<PrivateBlob>;

  public abstract save(blob: PrivateBlob): Promise<void>;

  /** Sum of reserved sizes of live blobs, optionally for one owner. */
  public abstract reservedBytes(
    now: Timestamp,
    ownerKey?: string,
  ): Promise<number>;
}
