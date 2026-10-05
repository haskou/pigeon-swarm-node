import type { HeliaInstance } from './adapters/types/HeliaInstance';

type HeliaBlocks = HeliaInstance['blockstore'];
type BlockGetOptions = NonNullable<Parameters<HeliaBlocks['get']>[1]>;

type BlockRetrieval = {
  readonly chunks: Promise<Uint8Array[]>;
  readonly controller: AbortController;
  settled: boolean;
  waiters: number;
};

/**
 * Helia's networked storage checks the local blockstore, then fetches from
 * the block brokers, and only afterwards stores the block and notifies
 * Bitswap. Two concurrent reads of one missing CID therefore both reach
 * Bitswap, and the second want can land after the first block was delivered
 * but before it was stored. Bitswap's `receivedBlock` then cancels that second
 * want without ever resolving its waiter, and the remote peer, which still
 * lists the CID as sent, does not answer the repeated want. The waiter stays
 * pending until the caller times out.
 *
 * Joining concurrent reads of the same CID into one retrieval removes the
 * window: the CID leaves the in-flight table only after the retrieval,
 * including the local store, has settled, so a later read hits the local
 * blockstore.
 */
export function withSingleFlightGets(blocks: HeliaBlocks): HeliaBlocks {
  const retrievals = new Map<string, BlockRetrieval>();

  const startRetrieval = (
    key: string,
    cid: Parameters<HeliaBlocks['get']>[0],
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
    cid: Parameters<HeliaBlocks['get']>[0],
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
