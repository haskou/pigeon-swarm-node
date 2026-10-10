import { Readable } from 'stream';

import { PrivateBlobByteRange } from '../PrivateBlobByteRange';

export default abstract class PrivateBlobBytesStore {
  public abstract delete(id: string): Promise<void>;

  public abstract read(id: string, range?: PrivateBlobByteRange): Readable;

  /**
   * Streams the source to storage without buffering it. The blob appears
   * atomically only when exactly `size` bytes arrived; otherwise nothing is
   * kept and PrivateBlobUploadSizeMismatchError is thrown.
   */
  public abstract write(
    id: string,
    source: Readable,
    size: number,
  ): Promise<void>;
}
