import 'reflect-metadata';
import 'module-alias/register';
import heliaRuntimeAdapter from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { PrivateIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';
import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Libp2pPubSubNode } from '@app/shared/infrastructure/pubsub/libp2p/Libp2pPubSubNode';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync, randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

type EnvironmentKey =
  | 'PIGEON_BOOTSTRAP_RELAY_MULTIADDRS'
  | 'PIGEON_LIBP2P_PORT'
  | 'PIGEON_PUBLIC_BOOTSTRAP_ENABLED'
  | 'PIGEON_PUBLIC_HOST'
  | 'PIGEON_RELAY_ENABLED';

type RawBlockConnection = IPFSConnection & {
  heliaCore?: {
    blockstore: {
      put(cid: unknown, bytes: Uint8Array): Promise<void>;
    };
  };
};

const ROOT = path.resolve(__dirname, '../../..');
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-private-ipfs-direct-e2e');
const NETWORK_NAME = 'two-private-ipfs-direct-e2e';
const WAIT_TIMEOUT_MS = 15000;
const ENVIRONMENT_KEYS: EnvironmentKey[] = [
  'PIGEON_BOOTSTRAP_RELAY_MULTIADDRS',
  'PIGEON_LIBP2P_PORT',
  'PIGEON_PUBLIC_BOOTSTRAP_ENABLED',
  'PIGEON_PUBLIC_HOST',
  'PIGEON_RELAY_ENABLED',
];

async function main(): Promise<void> {
  const environment = snapshotEnvironment();
  let nodeA: IPFSConnection | undefined;
  let nodeB: IPFSConnection | undefined;

  await fs.remove(TMP_ROOT);
  await fs.ensureDir(TMP_ROOT);

  try {
    const networkKey = new PrivateKey(generateNetworkKey());

    nodeA = await createPrivateNode('node-a', 19610, networkKey);
    nodeB = await createPrivateNode('node-b', 19611, networkKey);

    await dialNode(nodeB, nodeA, 'node-b -> node-a');
    await waitForPeer(nodeA, nodeB.getPeerId(), 'node-a to see node-b');
    await waitForPeer(nodeB, nodeA.getPeerId(), 'node-b to see node-a');

    const payload = createLargePayload();
    const cid = await nodeA.addBytes(payload);
    const downloaded = await withTimeout(
      nodeB.getBytes(cid),
      WAIT_TIMEOUT_MS,
      `node-b to fetch ${cid.valueOf()} from node-a`,
    );

    if (!downloaded.equals(payload)) {
      throw new Error(
        `Fetched bytes did not match original payload for ${cid.valueOf()}`,
      );
    }

    const rawPayload = Buffer.alloc(1024 * 1024, 11);
    const rawCid = await putRawBlock(nodeA, rawPayload);
    const downloadedRawBlock = await withTimeout(
      nodeB.getBytes(rawCid),
      WAIT_TIMEOUT_MS,
      `node-b to fetch raw 1MiB block ${rawCid.valueOf()} from node-a`,
    );

    if (!downloadedRawBlock.equals(rawPayload)) {
      throw new Error(
        `Fetched raw block did not match original payload for ${rawCid.valueOf()}`,
      );
    }

    console.info(
      JSON.stringify(
        {
          cid: cid.valueOf(),
          nodeAPeerId: nodeA.getPeerId(),
          nodeBPeerId: nodeB.getPeerId(),
          result: 'PASS',
          transportDsn: 'private-ipfs://direct-bitswap',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([nodeA?.stop(), nodeB?.stop()]);
    restoreEnvironment(environment);
    await fs.remove(TMP_ROOT);
  }
}

function snapshotEnvironment(): Record<EnvironmentKey, string | undefined> {
  return ENVIRONMENT_KEYS.reduce(
    (snapshot, key) => ({ ...snapshot, [key]: process.env[key] }),
    {} as Record<EnvironmentKey, string | undefined>,
  );
}

function restoreEnvironment(
  environment: Record<EnvironmentKey, string | undefined>,
): void {
  for (const key of ENVIRONMENT_KEYS) {
    const value = environment[key];

    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

async function createPrivateNode(
  name: string,
  port: number,
  networkKey: PrivateKey,
): Promise<IPFSConnection> {
  process.env.PIGEON_LIBP2P_PORT = String(port);
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  process.env.PIGEON_RELAY_ENABLED = 'false';
  delete process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;
  delete process.env.PIGEON_PUBLIC_HOST;

  await fs.ensureDir(path.join(TMP_ROOT, name));

  return PrivateIPFS.create({
    key: networkKey,
    name: NETWORK_NAME,
    storageLocation: path.join(TMP_ROOT, name, 'ipfs'),
  });
}

function generateNetworkKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');

  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

function createLargePayload(): Buffer {
  const payload = Buffer.alloc(4 * 1024 * 1024);
  const seed = Buffer.from(`private-ipfs-direct-${randomUUID()}`, 'utf8');

  for (let index = 0; index < payload.length; index += seed.length) {
    seed.copy(payload, index);
  }

  return payload;
}

async function putRawBlock(
  connection: IPFSConnection,
  payload: Buffer,
): Promise<IPFSId> {
  const nativeImport = new Function('path', 'return import(path)') as <T>(
    path: string,
  ) => Promise<T>;
  const [{ CID }, digestModule, { sha256 }] = await Promise.all([
    nativeImport<typeof import('multiformats/cid')>('multiformats/cid'),
    nativeImport<typeof import('multiformats/hashes/digest')>(
      'multiformats/hashes/digest',
    ),
    nativeImport<typeof import('multiformats/hashes/sha2')>(
      'multiformats/hashes/sha2',
    ),
  ]);
  const hash = await sha256.digest(payload);
  const cid = CID.createV1(0x55, digestModule.create(hash.code, hash.digest));
  const heliaCore = (connection as RawBlockConnection).heliaCore;

  if (!heliaCore) {
    throw new Error('PrivateIPFS connection does not expose heliaCore');
  }

  await heliaCore.blockstore.put(cid, payload);

  const ipfsId = new IPFSId(cid.toString());

  await connection.provideContent(ipfsId);

  return ipfsId;
}

async function dialNode(
  dialingConnection: IPFSConnection,
  targetConnection: IPFSConnection,
  label: string,
): Promise<void> {
  const dialingNode = getLibp2pNode(dialingConnection, 'dialing node');
  const targetAddress = getDialableLocalAddress(
    getLibp2pNode(targetConnection, 'target node'),
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAIT_TIMEOUT_MS);

  try {
    await dialingNode.dial?.(await heliaRuntimeAdapter.createMultiaddr(targetAddress), {
      signal: controller.signal,
    });
  } catch (error: unknown) {
    throw new Error(`${label} failed to dial ${targetAddress}: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function getLibp2pNode(
  connection: IPFSConnection,
  label: string,
): Libp2pPubSubNode {
  const node = connection.getContentFallbackNode?.();

  if (!node) {
    throw new Error(`${label} does not expose a libp2p node`);
  }

  return node;
}

function getDialableLocalAddress(node: Libp2pPubSubNode): string {
  const peerId = node.peerId?.toString();
  const address = (node.getMultiaddrs?.() || [])
    .map((value) => value.toString())
    .map((value) => value.replace('/ip4/0.0.0.0/', '/ip4/127.0.0.1/'))
    .find((value) => value.includes('/tcp/'));

  if (!peerId || !address) {
    throw new Error('Target libp2p node has no dialable TCP address');
  }

  if (address.includes('/p2p/')) {
    return address;
  }

  return `${address}/p2p/${peerId}`;
}

async function waitForPeer(
  connection: IPFSConnection,
  peerId: string,
  label: string,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (connection.getPeers().includes(peerId)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`${label} timed out`);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
