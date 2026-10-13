import { Readable } from 'stream';

import { PrivateBlobByteRange } from '../PrivateBlobByteRange';
import { PrivateBlobId } from '../value-objects/PrivateBlobId';
import { PrivateBlobSize } from '../value-objects/PrivateBlobSize';

export default abstract class PrivateBlobBytesStore {
  public abstract delete(id: PrivateBlobId): Promise<void>;

  /** Ids that have a stored blob or a partial upload on disk. */
  public abstract listIds(): Promise<PrivateBlobId[]>;

  public abstract read(
    id: PrivateBlobId,
    range?: PrivateBlobByteRange,
  ): Readable;

  /**
   * Streams the source to storage without buffering it. The blob appears
   * atomically only when exactly `size` bytes arrived; otherwise nothing is
   * kept and PrivateBlobUploadSizeMismatchError is thrown.
   */
  public abstract write(
    id: PrivateBlobId,
    source: Readable,
    size: PrivateBlobSize,
  ): Promise<void>;
}
