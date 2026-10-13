import { Timestamp } from '@haskou/value-objects';

import { PrivateBlob } from '../PrivateBlob';

export default abstract class PrivateBlobRepository {
  public abstract delete(id: string): Promise<void>;

  /** Blobs whose deadline passed, reserved or stored. */
  public abstract findExpired(now: Timestamp): Promise<PrivateBlob[]>;

  /** Stored blobs whose retention is shorter than `retentionMs`. */
  public abstract findStoredRetainedBelow(
    retentionMs: number,
  ): Promise<PrivateBlob[]>;

  public abstract hasById(id: string): Promise<boolean>;

  /** Rejects with PrivateBlobNotFoundError when the blob is absent. */
  public abstract requireById(id: string): Promise<PrivateBlob>;

  public abstract save(blob: PrivateBlob): Promise<void>;

  /** Sum of reserved sizes of live blobs, optionally for one owner. */
  public abstract reservedBytes(
    now: Timestamp,
    ownerKey?: string,
  ): Promise<number>;
}
