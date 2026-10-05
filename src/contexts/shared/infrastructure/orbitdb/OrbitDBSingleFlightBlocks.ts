import type { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

type HeliaBlocks = HeliaInstance['blockstore'];
type BlockCid = Parameters<HeliaBlocks['get']>[0];
type BlockGetOptions = NonNullable<Parameters<HeliaBlocks['get']>[1]>;

type BlockRetrieval = {
  readonly chunks: Promise<Uint8Array[]>;
  readonly controller: AbortController;
  settled: boolean;
  waiters: number;
};

function singleFlightBlocks(blocks: HeliaBlocks): HeliaBlocks {
  const retrievals = new Map<string, BlockRetrieval>();

  const startRetrieval = (
    key: string,
    cid: BlockCid,
    options: BlockGetOptions,
  ): BlockRetrieval => {
    const controller = new AbortController();
    const retrieval: BlockRetrieval = {
      chunks: (async (): Promise<Uint8Array[]> => {
        const chunks: Uint8Array[] = [];

        for await (const chunk of blocks.get(cid, {
          ...options,
          signal: controller.signal,
        })) {
          chunks.push(chunk);
        }

        return chunks;
      })(),
      controller,
      settled: false,
      waiters: 0,
    };
    const settle = (): void => {
      retrieval.settled = true;

      if (retrievals.get(key) === retrieval) {
        retrievals.delete(key);
      }
    };

    void retrieval.chunks.then(settle, settle);
    retrievals.set(key, retrieval);

    return retrieval;
  };

  const awaitUnlessAborted = (
    chunks: Promise<Uint8Array[]>,
    signal: AbortSignal | undefined,
  ): Promise<Uint8Array[]> => {
    if (signal === undefined) {
      return chunks;
    }

    signal.throwIfAborted();

    return new Promise<Uint8Array[]>((resolve, reject) => {
      const onAbort = (): void => reject(signal.reason);

      signal.addEventListener('abort', onAbort, { once: true });
      chunks
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  };

  async function* get(
    cid: BlockCid,
    options: BlockGetOptions = {},
  ): AsyncGenerator<Uint8Array> {
    if (options.offline === true) {
      yield* blocks.get(cid, options);

      return;
    }

    const key = cid.toString();
    const retrieval = retrievals.get(key) ?? startRetrieval(key, cid, options);

    retrieval.waiters += 1;

    try {
      yield* await awaitUnlessAborted(retrieval.chunks, options.signal);
    } finally {
      retrieval.waiters -= 1;

      if (retrieval.waiters === 0 && !retrieval.settled) {
        retrieval.controller.abort(options.signal?.reason);
      }
    }
  }

  return Object.create(blocks, { get: { value: get } }) as HeliaBlocks;
}

/**
 * Gives OrbitDB a view of Helia whose block reads are single-flight per CID.
 *
 * Helia's networked storage checks the local blockstore, fetches a missing
 * block through Bitswap, and only afterwards stores it and notifies Bitswap.
 * A second concurrent read of the same CID can therefore miss locally and
 * register its want in that gap. The first read's notification then marks the
 * shared want entry as cancelled, so the want is never sent and no block
 * event is ever dispatched for it: the second read stays pending until its
 * caller times out.
 *
 * OrbitDB hits this window on every private-network store at once: each store
 * verifies the same writer identity block from the same peer inside its
 * single-slot operation queue, so a lost want stalls every local write of
 * that store.
 *
 * Joining concurrent reads of the same CID into one retrieval removes the
 * window: the CID leaves the in-flight table only after the retrieval,
 * including the local store, has settled, so a later read hits the local
 * blockstore. Reads that must stay offline are not joined, and a reader that
 * aborts only leaves the shared retrieval, which is cancelled once no reader
 * is left.
 */
export function withSingleFlightBlocks(ipfs: HeliaInstance): HeliaInstance {
  return Object.create(ipfs, {
    blockstore: { value: singleFlightBlocks(ipfs.blockstore) },
  }) as HeliaInstance;
}
