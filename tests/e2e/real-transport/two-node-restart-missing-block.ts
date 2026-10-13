import 'reflect-metadata';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import InMemoryNodeNetworkSynchronizationMonitor from '@app/contexts/nodes/infrastructure/network-synchronization/InMemoryNodeNetworkSynchronizationMonitor';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { IPFSNetworkType } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkType';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { teardownAndExit, TeardownNode } from './RealTransportTeardown';

/**
 * A node restarts while the only peer serving one of its log blocks is
 * offline. Its startup must not wait on (or die from) the OrbitDB block
 * timeout: the replicated state runtime starts, the history subscription
 * resolves deferred, and the projection catches up once the peer is back.
 */

const networkId = randomUUID();
const documentIds = ['restart-1', 'restart-2', 'restart-3'];
const warnings: string[] = [];
const live = new Map<string, TeardownNode>();
const networkKey = new PrivateKey(
  generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString(),
);
let stage = 'setup';
let root: string | undefined;

const pause = (milliseconds: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, milliseconds);

  return promise;
};

async function until(
  label: string,
  condition: () => Promise<boolean>,
  timeoutMilliseconds = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await pause(200);
  }
  throw new Error(`Timed out: ${label}`);
}

function privateNetwork(helia: HeliaInstance): IPFSNetwork {
  return {
    getHeliaCore: () => helia,
    getId: () => networkId,
    getName: () => 'restart-missing-block',
    getPeerId: () => helia.libp2p.peerId.toString(),
    getPeers: () => helia.libp2p.getPeers().map(String),
    getType: () => IPFSNetworkType.PRIVATE,
    isPrivate: () => true,
    onPeerConnected: (): void => undefined,
    onPeerDisconnected: (): void => undefined,
  } as unknown as IPFSNetwork;
}

/**
 * Both nodes share one process, so the OrbitDB directory each node opens is
 * selected through the environment right before its stores open.
 */
async function startHelia(name: string): Promise<HeliaInstance> {
  assert.ok(root);
  process.env.IPFS_STORAGE_PATH = path.join(root, name);
  const helia = await HeliaIPFS.createPrivateHeliaCore(
    {
      contentRoutingEnabled: false,
      distributedHashTableEnabled: false,
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      localPeerDiscoveryEnabled: false,
      manualRelayMultiaddrs: [],
      publicRelayDiscoveryEnabled: false,
      storageLocation: path.join(root, name, 'ipfs'),
    },
    networkKey,
    networkId,
  );

  live.set(name, { helia, name });

  return helia;
}

/** The writer only serves its log: raw stores, no projections. */
async function startWriter(): Promise<{
  helia: HeliaInstance;
  stores: OrbitDBPrivateNetworkStores;
}> {
  const helia = await startHelia('writer');
  const stores = await OrbitDBPrivateNetworkStores.open(privateNetwork(helia));

  live.set('writer', { helia, name: 'writer', orbitdb: stores });
  await stores.startSynchronization();

  return { helia, stores };
}

/** The reader starts exactly as a node does: through the runtime. */
async function startReader(): Promise<{
  helia: HeliaInstance;
  registry: OrbitDBReplicatedStateRegistry;
}> {
  const helia = await startHelia('reader');
  const network = privateNetwork(helia);
  const registry = new OrbitDBReplicatedStateRegistry();
  const runtime = new OrbitDBReplicatedStateRuntime(
    {
      getAll: () => [network],
      onNetworkRegistered: (): void => undefined,
      onNetworkRemoved: (): void => undefined,
    } as unknown as IPFSNetworkRegistry,
    registry,
    new InMemoryNodeNetworkSynchronizationMonitor(),
  );

  live.set('reader', {
    helia,
    name: 'reader',
    orbitdb: { stop: () => registry.unregister(networkId) },
  });
  await runtime.run();

  return { helia, registry };
}

async function stop(name: string): Promise<void> {
  const node = live.get(name);

  assert.ok(node);
  live.delete(name);
  await node.orbitdb?.stop();
  await node.helia.stop();
}

async function connect(from: HeliaInstance, to: HeliaInstance): Promise<void> {
  const address = to.libp2p
    .getMultiaddrs()
    .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));

  assert.ok(address, 'Each fixture peer must listen only on loopback');
  const target = await heliaRuntimeAdapter.createMultiaddr(address.toString());

  await until('fixture peers connect', async () => {
    try {
      await from.libp2p.dial(target);

      return true;
    } catch {
      return false;
    }
  });
}

async function subscribe(
  registry: OrbitDBReplicatedStateRegistry,
): Promise<Set<string>> {
  const seen = new Set<string>();

  await registry.onDocumentUpdated(
    'calls',
    (document) => {
      seen.add(String(document.id));
    },
    { includeHistory: true },
  );

  return seen;
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-restart-missing-block-'));
  process.env.NODE_ENV = 'test';
  const noop = (): void => undefined;

  new Kernel({
    logger: {
      debug: noop,
      error: noop,
      info: noop,
      warn: (message: string) => warnings.push(String(message)),
    },
  });

  stage = 'replicate the log to the reader';
  const writer = await startWriter();
  let reader = await startReader();

  await connect(reader.helia, writer.helia);
  const replicated = await subscribe(reader.registry);
  const hashes: string[] = [];

  for (const [sequence, id] of documentIds.entries())
    hashes.push(await writer.stores.calls.put!({ id, sequence }));
  await until('the reader replicates every document', () =>
    Promise.resolve(documentIds.every((id) => replicated.has(id))),
  );

  stage = 'lose the oldest log block on the reader';
  await stop('reader');
  await stop('writer');
  const missing = await heliaRuntimeAdapter.parseCid(hashes[0]);
  const readerBlocks = await heliaRuntimeAdapter.createFsBlockstore(
    path.join(root, 'reader', 'ipfs', 'blockstore'),
  );

  await readerBlocks.open();
  assert.ok(await readerBlocks.has(missing));
  await readerBlocks.delete(missing);
  await readerBlocks.close();

  stage = 'restart the reader while the writer is offline';
  reader = await startReader();
  assert.equal(
    await reader.helia.blockstore.has(missing),
    false,
    'The restarted reader must lack the oldest log block',
  );
  const startedAt = Date.now();
  const restarted = await subscribe(reader.registry);

  assert.ok(
    warnings.some((message) =>
      message.startsWith(
        'OrbitDB document subscriber bootstrap deferred: store=calls',
      ),
    ),
    'The history subscription must have hit the missing block and deferred',
  );
  console.log(
    `PASS: restarted reader started without the missing block (subscription deferred after ${Date.now() - startedAt} ms)`,
  );

  stage = 'catch up once the writer is back';
  await connect(reader.helia, (await startWriter()).helia);
  await until('the restarted reader catches up with every document', () =>
    Promise.resolve(documentIds.every((id) => restarted.has(id))),
  );
  assert.ok(await reader.helia.blockstore.has(missing));
  console.log(
    'PASS: restarted reader recovered the missing block from its peer',
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL restart missing block deadline during ${stage}`);
  process.exit(1);
}, 240_000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL restart missing block during ${stage}`);
    for (const message of warnings) console.error(`warn: ${message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit([...live.values()], root);
  });
