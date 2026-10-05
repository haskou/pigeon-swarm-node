import type { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

import { withSingleFlightBlocks } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBSingleFlightBlocks';

type Blocks = HeliaInstance['blockstore'];
type Cid = Parameters<Blocks['get']>[0];
type Retrieval = {
  fail(error: Error): void;
  options: { offline?: boolean; signal?: AbortSignal };
  resolve(block: Uint8Array): void;
};

function cid(value: string): Cid {
  return { toString: () => value } as unknown as Cid;
}

function collect(blocks: Blocks, key: Cid, signal?: AbortSignal) {
  return (async (): Promise<Uint8Array[]> => {
    const chunks: Uint8Array[] = [];

    for await (const chunk of blocks.get(key, { signal })) {
      chunks.push(chunk);
    }

    return chunks;
  })();
}

function blocksWithPendingRetrievals(): {
  blocks: Blocks;
  retrievals: Retrieval[];
} {
  const retrievals: Retrieval[] = [];
  const blocks = {
    async *get(_cid: Cid, options: Retrieval['options'] = {}) {
      const block = await new Promise<Uint8Array>((resolve, reject) => {
        retrievals.push({ fail: reject, options, resolve });
        options.signal?.addEventListener('abort', () =>
          reject(options.signal?.reason),
        );
      });

      yield block;
    },
  } as unknown as Blocks;

  return {
    blocks: withSingleFlightBlocks({
      blockstore: blocks,
    } as unknown as HeliaInstance).blockstore,
    retrievals,
  };
}

describe('withSingleFlightBlocks', () => {
  it('serves concurrent reads of one CID from a single retrieval', async () => {
    const { blocks, retrievals } = blocksWithPendingRetrievals();

    const first = collect(blocks, cid('same'));
    const second = collect(blocks, cid('same'));
    retrievals[0].resolve(new Uint8Array([1, 2, 3]));

    expect(await first).toEqual([new Uint8Array([1, 2, 3])]);
    expect(await second).toEqual([new Uint8Array([1, 2, 3])]);
    expect(retrievals).toHaveLength(1);
  });

  it('starts a new retrieval after a failed one instead of replaying the failure', async () => {
    const { blocks, retrievals } = blocksWithPendingRetrievals();

    const failed = collect(blocks, cid('same'));
    retrievals[0].fail(new Error('not found'));
    await expect(failed).rejects.toThrow('not found');

    const retried = collect(blocks, cid('same'));
    retrievals[1].resolve(new Uint8Array([9]));

    expect(await retried).toEqual([new Uint8Array([9])]);
  });

  it('keeps the shared retrieval alive for readers that did not abort', async () => {
    const { blocks, retrievals } = blocksWithPendingRetrievals();
    const abortedReader = new AbortController();

    const aborted = collect(blocks, cid('same'), abortedReader.signal);
    const remaining = collect(blocks, cid('same'));
    abortedReader.abort(new Error('reader gave up'));

    await expect(aborted).rejects.toThrow('reader gave up');
    expect(retrievals[0].options.signal?.aborted).toBe(false);

    retrievals[0].resolve(new Uint8Array([4]));

    expect(await remaining).toEqual([new Uint8Array([4])]);
  });

  it('cancels the retrieval once every reader aborted', async () => {
    const { blocks, retrievals } = blocksWithPendingRetrievals();
    const firstReader = new AbortController();
    const secondReader = new AbortController();

    const first = collect(blocks, cid('same'), firstReader.signal);
    const second = collect(blocks, cid('same'), secondReader.signal);
    firstReader.abort(new Error('first gave up'));
    secondReader.abort(new Error('second gave up'));

    await expect(first).rejects.toThrow('first gave up');
    await expect(second).rejects.toThrow('second gave up');
    expect(retrievals[0].options.signal?.aborted).toBe(true);
  });

  it('does not join reads that must not touch the network', async () => {
    const { blocks, retrievals } = blocksWithPendingRetrievals();

    const networked = collect(blocks, cid('same'));
    const offline = (async (): Promise<Uint8Array[]> => {
      const chunks: Uint8Array[] = [];

      for await (const chunk of blocks.get(cid('same'), { offline: true })) {
        chunks.push(chunk);
      }

      return chunks;
    })();
    retrievals[1].resolve(new Uint8Array([7]));
    retrievals[0].resolve(new Uint8Array([8]));

    expect(await offline).toEqual([new Uint8Array([7])]);
    expect(await networked).toEqual([new Uint8Array([8])]);
  });
});
