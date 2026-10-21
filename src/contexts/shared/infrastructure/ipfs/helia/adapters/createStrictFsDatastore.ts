import type { FsDatastore } from 'datastore-fs';

import { readFile } from 'node:fs/promises';

/**
 * `datastore-fs` reports every `get()` failure (EIO, EACCES, abort, ...) as
 * `NotFoundError`, so a local I/O error reads as a verified absence. The
 * datastore is loaded as an ES module at runtime, hence the class is built
 * from the loaded constructor.
 *
 * Here only a missing file is delegated to the stock `get()` (which answers
 * `NotFoundError`); any other read failure is rethrown untouched, so callers
 * see a retrieval failure and never absence.
 */
export default function createStrictFsDatastore(
  datastoreFsModule: typeof import('datastore-fs'),
  path: string,
): FsDatastore {
  class StrictFsDatastore extends datastoreFsModule.FsDatastore {
    public override async get(
      key: Parameters<FsDatastore['get']>[0],
      options?: Parameters<FsDatastore['get']>[1],
    ): Promise<Uint8Array> {
      options?.signal?.throwIfAborted();

      try {
        return await readFile(this._encode(key).file, {
          signal: options?.signal,
        });
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
          return super.get(key, options);
        }

        throw error;
      }
    }
  }

  return new StrictFsDatastore(path);
}
