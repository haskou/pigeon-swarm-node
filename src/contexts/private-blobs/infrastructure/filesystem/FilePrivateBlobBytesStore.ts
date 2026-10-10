import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rename, rm } from 'fs/promises';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

import { PrivateBlobUploadSizeMismatchError } from '../../domain/errors/PrivateBlobUploadSizeMismatchError';
import { PrivateBlobByteRange } from '../../domain/PrivateBlobByteRange';
import PrivateBlobBytesStore from '../../domain/repositories/PrivateBlobBytesStore';

/**
 * Blob bytes on the local filesystem, never in IPFS, OrbitDB or any
 * replicated store. Uploads stream through a temporary file and are renamed
 * into place only when complete.
 */
export default class FilePrivateBlobBytesStore extends PrivateBlobBytesStore {
  private static readonly ID = /^[0-9a-f-]{36}$/;

  private directory(): string {
    return path.resolve(pigeonEnvironment().PRIVATE_BLOB_STORAGE_PATH);
  }

  private pathFor(id: string, suffix: string): string {
    if (!FilePrivateBlobBytesStore.ID.test(id)) {
      throw new Error('Invalid private blob id');
    }

    return path.join(this.directory(), `${id}.${suffix}`);
  }

  private limiter(size: number): {
    counter: Transform;
    received: () => number;
  } {
    let received = 0;
    const counter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        received += chunk.length;

        if (received > size) {
          callback(new PrivateBlobUploadSizeMismatchError());

          return;
        }

        callback(null, chunk);
      },
    });

    return { counter, received: () => received };
  }

  public async delete(id: string): Promise<void> {
    await rm(this.pathFor(id, 'blob'), { force: true });
    await rm(this.pathFor(id, 'part'), { force: true });
  }

  public read(id: string, range?: PrivateBlobByteRange): Readable {
    return createReadStream(this.pathFor(id, 'blob'), range);
  }

  public async write(
    id: string,
    source: Readable,
    size: number,
  ): Promise<void> {
    const partial = this.pathFor(id, 'part');
    const { counter, received } = this.limiter(size);

    await mkdir(this.directory(), { mode: 0o700, recursive: true });

    try {
      await pipeline(
        source,
        counter,
        createWriteStream(partial, { flags: 'w', mode: 0o600 }),
      );

      if (received() !== size) {
        throw new PrivateBlobUploadSizeMismatchError();
      }

      await rename(partial, this.pathFor(id, 'blob'));
    } catch (error) {
      await rm(partial, { force: true });

      throw error;
    }
  }
}
