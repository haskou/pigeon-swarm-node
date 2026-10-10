import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

type Handler = (stream: unknown, connection: unknown) => Promise<void>;

interface OrbitLog {
  append(data: string): Promise<unknown>;
  join(other: OrbitLog): Promise<unknown>;
}

interface OrbitSync {
  events: { on(event: 'error', listener: (error: Error) => void): void };
  start(): Promise<void>;
}

interface OrbitModule {
  Identities(options: { keystore: unknown }): Promise<{
    createIdentity(options: { id: string }): Promise<unknown>;
  }>;
  KeyStore(options: { path: string }): Promise<unknown>;
  Log(identity: unknown, options: { logId: string }): Promise<OrbitLog>;
}

const nativeImport = new Function('name', 'return import(name)') as <T>(
  name: string,
) => Promise<T>;

function fakeIpfs(): { handler: () => Handler; ipfs: unknown } {
  const handlers: Handler[] = [];
  const noop = (): void => undefined;
  const resolved = (): Promise<void> => Promise.resolve();
  const pubsub = {
    addEventListener: noop,
    publish: resolved,
    removeEventListener: noop,
    subscribe: resolved,
    unsubscribe: resolved,
  };

  return {
    handler: (): Handler => handlers[0],
    ipfs: {
      libp2p: {
        addEventListener: noop,
        getConnections: (): unknown[] => [],
        handle: (_protocol: string, handler: Handler): Promise<void> => {
          handlers.push(handler);

          return resolved();
        },
        removeEventListener: noop,
        services: { pubsub },
        unhandle: resolved,
      },
    },
  };
}

async function main(): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'orbitdb-heads-'));

  try {
    const orbit = await nativeImport<OrbitModule>('@orbitdb/core');
    const Sync = (
      await nativeImport<{ default: (options: unknown) => Promise<OrbitSync> }>(
        '@orbitdb/core/src/sync.js',
      )
    ).default;
    const identities = await orbit.Identities({
      keystore: await orbit.KeyStore({ path: directory }),
    });
    const logOf = async (id: string): Promise<OrbitLog> =>
      orbit.Log(await identities.createIdentity({ id }), { logId: 'heads' });
    const first = await logOf('a');
    const second = await logOf('b');
    await first.append('one');
    await second.append('two');
    await first.join(second);

    const sender = fakeIpfs();
    await (
      await Sync({
        ipfs: sender.ipfs,
        log: first,
        onSynced: () => Promise.resolve(),
      })
    ).start();
    const sent: Uint8Array[] = [];
    await sender.handler()(
      {
        close: (): Promise<void> => Promise.resolve(),
        send: (bytes: Uint8Array): number => sent.push(bytes),
        [Symbol.asyncIterator]: (): AsyncIterator<never> => ({
          next: () => Promise.resolve({ done: true, value: undefined }),
        }),
      },
      { remotePeer: 'sender' },
    );
    assert.equal(sent.length, 2, 'the sender must emit one frame per head');

    // A stream transport may deliver both heads as one chunk.
    const chunk = new Uint8Array(
      sent.reduce((n, bytes) => n + bytes.length, 0),
    );
    sent.reduce((offset, bytes) => {
      chunk.set(bytes, offset);

      return offset + bytes.length;
    }, 0);

    const received: unknown[] = [];
    const errors: Error[] = [];
    const receiver = fakeIpfs();
    const sync = await Sync({
      ipfs: receiver.ipfs,
      log: await logOf('c'),
      onSynced: (entry: { payload: unknown }) => {
        received.push(entry.payload);

        return Promise.resolve();
      },
    });
    sync.events.on('error', (error) => errors.push(error));
    await sync.start();
    let delivered = false;
    await receiver.handler()(
      {
        close: (): Promise<void> => Promise.resolve(),
        send: (): number => 0,
        [Symbol.asyncIterator]: (): AsyncIterator<{
          subarray: () => Uint8Array;
        }> => ({
          next: () => {
            if (delivered) {
              return Promise.resolve({ done: true, value: undefined });
            }
            delivered = true;

            return Promise.resolve({
              done: false,
              value: { subarray: (): Uint8Array => chunk },
            });
          },
        }),
      },
      { remotePeer: 'receiver' },
    );

    assert.deepEqual(errors, []);
    assert.deepEqual([...received].sort(), ['one', 'two']);
    console.info('PASS orbitdb heads framing: coalesced heads decode');
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
