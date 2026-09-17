import 'reflect-metadata';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import Kernel from '@haskou/ddd-kernel';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const nativeImport = new Function('name', 'return import(name)') as <TModule>(
  name: string,
) => Promise<TModule>;

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main(mode: 'direct' | 'queued' | 'writing'): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'pigeon-reconfiguration-'));
  process.env.IPFS_STORAGE_PATH = root;
  process.env.NODE_ENV = 'test';
  const noop = (): void => undefined;
  new Kernel({ logger: { debug: noop, error: noop, info: noop, warn: noop } });
  const { CID } = await nativeImport<{
    CID: {
      createV1(
        codec: number,
        digest: unknown,
      ): { toString(base?: unknown): string };
    };
  }>('multiformats/cid');
  const { sha256 } = await nativeImport<{
    sha256: { digest(bytes: Uint8Array): Promise<unknown> };
  }>('multiformats/hashes/sha2');
  const { base58btc } = await nativeImport<{ base58btc: unknown }>(
    'multiformats/bases/base58',
  );
  const { default: Entry } = await nativeImport<{
    default: {
      encode(entry: unknown): Promise<{ bytes: Uint8Array }>;
      create(
        identity: unknown,
        id: string,
        payload: unknown,
        encrypt: undefined,
        clock: undefined,
        next: string[],
      ): Promise<unknown>;
    };
  }>('@orbitdb/core/src/oplog/entry.js');
  const missing = CID.createV1(85, await sha256.digest(new Uint8Array([42])));
  const blocks = new Map<string, Uint8Array>();
  let readStarted!: () => void;
  const reading = new Promise<void>((resolve) => {
    readStarted = resolve;
  });
  let readAborted = false;
  let pauseWrites = false;
  let writeStarted!: () => void;
  const writePending = new Promise<void>((resolve) => {
    writeStarted = resolve;
  });
  let resumeWrite!: () => void;
  const writeReleased = new Promise<void>((resolve) => {
    resumeWrite = resolve;
  });
  let writeSignal: AbortSignal | undefined;
  const pubsub = Object.assign(new EventTarget(), {
    subscribe: async (): Promise<void> => undefined,
    unsubscribe: async (): Promise<void> => undefined,
    publish: async (): Promise<void> => undefined,
  });
  const ipfs = {
    blockstore: {
      async *get(
        cid: { toString(): string },
        options: { signal: AbortSignal },
      ): AsyncGenerator<Uint8Array> {
        options.signal.throwIfAborted();
        const bytes = blocks.get(cid.toString());

        if (bytes) {
          yield bytes;

          return;
        }
        assert.equal(cid.toString(), missing.toString());
        readStarted();
        await new Promise<never>((_, reject) => {
          const abort = (): void => {
            readAborted = true;
            reject(options.signal.reason);
          };

          if (options.signal.aborted) abort();
          else options.signal.addEventListener('abort', abort, { once: true });
        });
      },
      async put(
        cid: { toString(): string },
        bytes: Uint8Array,
        options: { signal: AbortSignal },
      ): Promise<void> {
        if (pauseWrites) {
          writeSignal = options.signal;
          writeStarted();
          await writeReleased;
        }
        options.signal.throwIfAborted();
        blocks.set(cid.toString(), bytes);

        return Promise.resolve();
      },
    },
    libp2p: Object.assign(new EventTarget(), {
      handle: async (): Promise<void> => undefined,
      unhandle: async (): Promise<void> => undefined,
      getPeers: (): never[] => [],
      peerId: 'offline-reconfiguration-peer',
      services: { pubsub },
    }),
    pins: { isPinned: (): Promise<boolean> => Promise.resolve(true) },
  };
  const network = {
    getHeliaCore: (): typeof ipfs => ipfs,
    getId: (): string => 'same-network-id',
    getPeerId: (): string => 'offline-reconfiguration-peer',
  } as unknown as IPFSNetwork;
  const originalCreate: typeof orbitDBRuntimeAdapter.createOrbitDB =
    orbitDBRuntimeAdapter.createOrbitDB.bind(orbitDBRuntimeAdapter);
  let identity: unknown;
  orbitDBRuntimeAdapter.createOrbitDB = async (options) => {
    const orbitdb = await originalCreate(options);
    identity = orbitdb.identity;

    return orbitdb;
  };
  let stores: OrbitDBPrivateNetworkStores | undefined;
  let stopping: Promise<void> | undefined;
  let joining: Promise<unknown> | undefined;
  try {
    stores = await OrbitDBPrivateNetworkStores.open(network);
    await stores.calls.put!({ id: 'retained', value: 'survives replacement' });
    const retained = await stores.calls.get!('retained');
    const log = stores.calls.log as unknown as {
      id: string;
      joinEntry(entry: unknown): Promise<unknown>;
      storage: { close(): Promise<void> };
    };
    const entry = await Entry.create(
      identity,
      log.id,
      { key: 'remote', op: 'PUT', value: { id: 'remote' } },
      undefined,
      undefined,
      [missing.toString(base58btc)],
    );
    if (mode === 'queued') {
      await stores.calls.sync!.start();
      const { bytes } = await Entry.encode(entry);
      pubsub.dispatchEvent(
        new CustomEvent('message', {
          detail: { topic: stores.calls.address, data: bytes },
        }),
      );
    } else {
      joining = log.joinEntry(entry).catch((error: unknown) => error);
    }
    await bounded(reading, 'Missing-block read did not start');
    pauseWrites = mode === 'writing';
    const queued = { id: 'queued', value: 'accepted before replacement' };
    const writing = stores.calls.put!(queued).then(
      (): { error: unknown } => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );
    if (mode === 'writing')
      await bounded(writePending, 'Local block write did not start');
    stopping = stores.stop();
    if (mode === 'writing') {
      let stopped = false;
      void stopping.then(() => {
        stopped = true;
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      assert.equal(
        stopped,
        false,
        'Shutdown must wait for the pending local write',
      );
      assert.equal(
        writeSignal!.aborted,
        false,
        'Replication cancellation must leave local persistence active',
      );
      resumeWrite();
    }
    await bounded(
      stopping,
      'Network reconfiguration stalled: OrbitDB shutdown did not cancel its pending IPFS block read',
    );
    assert.equal(
      readAborted,
      true,
      'Shutdown must abort and settle the block read',
    );
    await joining;
    const result = await writing;
    assert.equal(result.error, undefined, 'Accepted local write must complete');
    stores = await OrbitDBPrivateNetworkStores.open(network);
    stopping = undefined;
    assert.deepEqual(await stores.calls.get!('retained'), retained);
    assert.deepEqual(
      ((await stores.calls.get!('queued')) as { value: unknown }).value,
      queued,
    );
    console.log(`PASS: ${mode} cancelled; accepted write survived reopening`);
  } finally {
    resumeWrite();
    if (stores) {
      for (const { database } of stores.getSynchronizationStores()) {
        await (
          database.log as unknown as { storage: { close(): Promise<void> } }
        ).storage.close();
      }
      await joining;
      await (stopping ?? stores.stop());
    }
    orbitDBRuntimeAdapter.createOrbitDB = originalCreate;
    await rm(root, { force: true, recursive: true });
  }
}

main('queued')
  .then(() => main('direct'))
  .then(() => main('writing'))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
