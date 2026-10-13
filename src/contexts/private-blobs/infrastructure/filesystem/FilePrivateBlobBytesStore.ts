import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, rename, rm } from 'fs/promises';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

import { PrivateBlobUploadSizeMismatchError } from '../../domain/errors/PrivateBlobUploadSizeMismatchError';
import { PrivateBlobByteRange } from '../../domain/PrivateBlobByteRange';
import PrivateBlobBytesStore from '../../domain/repositories/PrivateBlobBytesStore';
import { PrivateBlobId } from '../../domain/value-objects/PrivateBlobId';
import { PrivateBlobSize } from '../../domain/value-objects/PrivateBlobSize';

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

  private pathFor(id: PrivateBlobId, suffix: string): string {
    const name = id.valueOf();

    if (!FilePrivateBlobBytesStore.ID.test(name)) {
      throw new Error('Invalid private blob id');
    }

    return path.join(this.directory(), `${name}.${suffix}`);
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

  public async delete(id: PrivateBlobId): Promise<void> {
    await rm(this.pathFor(id, 'blob'), { force: true });
    await rm(this.pathFor(id, 'part'), { force: true });
  }

  /** Only names this store writes are listed; other files are never touched. */
  public async listIds(): Promise<PrivateBlobId[]> {
    let names: string[];

    try {
      names = await readdir(this.directory());
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }

    const ids = new Set<string>();

    for (const name of names) {
      const match = /^([0-9a-f-]{36})\.(?:blob|part)$/.exec(name);

      if (match) {
        ids.add(match[1]);
      }
    }

    return [...ids].map((id) => new PrivateBlobId(id));
  }

  public read(id: PrivateBlobId, range?: PrivateBlobByteRange): Readable {
    return createReadStream(this.pathFor(id, 'blob'), range);
  }

  public async write(
    id: PrivateBlobId,
    source: Readable,
    size: PrivateBlobSize,
  ): Promise<void> {
    const expected = size.valueOf();
    const partial = this.pathFor(id, 'part');
    const { counter, received } = this.limiter(expected);

    await mkdir(this.directory(), { mode: 0o700, recursive: true });

    try {
      await pipeline(
        source,
        counter,
        createWriteStream(partial, { flags: 'w', mode: 0o600 }),
      );

      if (received() !== expected) {
        throw new PrivateBlobUploadSizeMismatchError();
      }

      await rename(partial, this.pathFor(id, 'blob'));
    } catch (error) {
      await rm(partial, { force: true });

      throw error;
    }
  }
}
