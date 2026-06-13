import 'reflect-metadata';
import 'module-alias/register';

import Kernel from '@app/Kernel';
import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import libp2pKeyAdapter from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';
import { PrivateIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import orbitDBRuntimeAdapter from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import PrivateNetworkRelayRecordDirectory from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync, randomBytes } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-private-relay-discovery-e2e');
const NETWORK_ID = 'private-relay-discovery-e2e';
const NETWORK_NAME = 'private-relay-discovery-e2e';
const WAIT_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_TIMEOUT_MS || 60000,
);
const FETCH_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_FETCH_TIMEOUT_MS || 10000,
);

type PrivateRelayDiscoveryNode = {
  directory: PrivateNetworkRelayRecordDirectory;
  network: IPFSNetwork;
  orbitdb?: OrbitDBInstance;
  publicPrivateKey: Libp2pPrivateKeyLike;
};

type TestLogger = {
  debug(message: string): void;
  error(message: string): void;
  info(message: string): void;
  warn(message: string): void;
};

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
  configureEnvironment();
  configureTestLogger();

  const networkKey = new PrivateKey(generateNetworkKey());
  const relay = await createNode('relay', networkKey, {
    enableRelayServer: true,
    listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
    relayDataLimitBytes: 16 * 1024 * 1024,
  });
  const leaf = await createNode('leaf', networkKey, {
    listenAddresses: [],
  });

  try {
    const relayAddress = await waitForMultiaddr(
      relay.network,
      (multiaddr) =>
        multiaddr.includes('/ip4/127.0.0.1/tcp/') &&
        !multiaddr.includes('/p2p-circuit'),
      'relay direct multiaddr',
    );

    await discoverRelay(relay, leaf, relayAddress);
    await assertIPFSFetch(relay.network, leaf.network);
    await assertPubSub(relay.network, leaf.network);
    await assertOrbitDBReplication(relay, leaf);

    console.info(
      JSON.stringify(
        {
          leafPeerId: leaf.network.getPeerId(),
          relayPeerId: relay.network.getPeerId(),
          result: 'PASS',
          transportDsn: 'private-relay-record-discovery://',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([
      leaf.orbitdb?.stop(),
      relay.orbitdb?.stop(),
      leaf.directory.stopPublicConnection(),
      relay.directory.stopPublicConnection(),
      leaf.network.stop(),
      relay.network.stop(),
    ]);
    await removeTmpRoot();
  }
}

function configureEnvironment(): void {
  delete process.env.PIGEON_PRIVATE_RELAY_BOOTSTRAP_MULTIADDRS;
  delete process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;
  process.env.PIGEON_RELAY_RECORD_TTL_MS = '600000';
  process.env.PIGEON_RELAY_RECORD_IPNS_WINDOW_MS = '600000';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED =
    process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED || 'true';
}

function configureTestLogger(): void {
  const noop = (): void => undefined;

  (Kernel as unknown as { _logs: TestLogger })._logs = {
    debug: noop,
    error: (message: string): void => console.error(message),
    info: noop,
    warn: (message: string): void => console.warn(message),
  };
}

async function createNode(
  name: string,
  networkKey: PrivateKey,
  options: {
    enableRelayServer?: boolean;
    listenAddresses: string[];
    relayDataLimitBytes?: number;
  },
): Promise<PrivateRelayDiscoveryNode> {
  const publicPrivateKey = await libp2pKeyAdapter.generateEd25519KeyPair();
  const config = IPFSNetworkConfig.fromPrimitives({
    id: NETWORK_ID,
    key: networkKey.valueOf(),
    name: NETWORK_NAME,
  });
  const connection = await PrivateIPFS.create({
    key: networkKey,
    name: NETWORK_NAME,
    privateKey: publicPrivateKey,
    storageLocation: path.join(TMP_ROOT, name, 'private-ipfs'),
    ...options,
  });

  process.env.IPFS_STORAGE_PATH = path.join(TMP_ROOT, name, 'public-ipfs');

  return {
    directory: new PrivateNetworkRelayRecordDirectory(),
    network: new IPFSNetwork(config, connection),
    publicPrivateKey,
  };
}

async function discoverRelay(
  relay: PrivateRelayDiscoveryNode,
  leaf: PrivateRelayDiscoveryNode,
  relayAddress: string,
): Promise<void> {
  await waitFor(
    async () => {
      await relay.directory.publish(
        relay.network,
        {
          announceAddresses: [relayAddress],
          listenAddresses: [relayAddress],
          relayDataLimitBytes: 16 * 1024 * 1024,
        },
        relay.publicPrivateKey,
      );
      await leaf.directory.discover(leaf.network, leaf.publicPrivateKey);

      return leaf.network.getPeers().includes(relay.network.getPeerId())
        ? true
        : undefined;
    },
    'leaf to discover and dial relay from public relay record',
  );
}

async function assertIPFSFetch(
  provider: IPFSNetwork,
  requester: IPFSNetwork,
): Promise<void> {
  const bytes = randomBytes(128 * 1024);
  const cid = await provider.addBytes(bytes);
  const fetched = await withTimeout(
    (signal) => requester.getBytes(cid, signal),
    FETCH_TIMEOUT_MS,
    `fetch private IPFS CID ${cid.valueOf()}`,
  );

  if (!Buffer.from(bytes).equals(fetched)) {
    throw new Error(`Fetched bytes mismatch for ${cid.valueOf()}`);
  }
}

async function assertPubSub(
  publisher: IPFSNetwork,
  subscriber: IPFSNetwork,
): Promise<void> {
  const topic = `pigeon-swarm.e2e.${NETWORK_ID}.pubsub`;
  const payload = `payload-${Date.now()}`;
  let received: string | undefined;

  await subscriber.subscribePubSub(topic, async (message) => {
    received = message;
  });

  await waitFor(
    async () => {
      await publisher.publishPubSub(topic, payload);

      return received === payload ? true : undefined;
    },
    'private pubsub message through discovered relay',
  );
}

async function assertOrbitDBReplication(
  writerNode: PrivateRelayDiscoveryNode,
  readerNode: PrivateRelayDiscoveryNode,
): Promise<void> {
  const writerDb = await createOrbitDB(writerNode, 'writer');
  const readerDb = await createOrbitDB(readerNode, 'reader');
  const AccessController =
    await orbitDBRuntimeAdapter.createPrivateNetworkAccessController();
  const Database = await orbitDBRuntimeAdapter.createDocumentsDatabase();
  const address = `${NETWORK_ID}/documents/e2e-relay-discovery`;
  const writer = await openDocuments(writerDb, address, AccessController, Database);
  const reader = await openDocuments(readerDb, address, AccessController, Database);
  const document = {
    id: `orbitdb-proof-${Date.now()}`,
    replicated: true,
  };

  writerNode.orbitdb = writerDb;
  readerNode.orbitdb = readerDb;

  await writer.put?.(document);

  await waitFor(
    async () => {
      const documents = await reader.query?.((candidate) => {
        return candidate.id === document.id;
      });

      return documents && documents.length > 0 ? true : undefined;
    },
    'OrbitDB document replication through discovered private relay',
  );

  await writer.close();
  await reader.close();
}

async function createOrbitDB(
  node: PrivateRelayDiscoveryNode,
  label: string,
): Promise<OrbitDBInstance> {
  return orbitDBRuntimeAdapter.createOrbitDB({
    directory: path.join(TMP_ROOT, label, 'orbitdb'),
    id: `${label}-${node.network.getPeerId()}`,
    ipfs: node.network.getHeliaCore(),
  });
}

async function openDocuments(
  orbitdb: OrbitDBInstance,
  address: string,
  AccessController: unknown,
  Database: unknown,
): Promise<OrbitDBDatabase> {
  return orbitdb.open(address, {
    AccessController,
    Database,
    type: 'documents',
  });
}

function generateNetworkKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');

  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

async function waitForMultiaddr(
  network: IPFSNetwork,
  predicate: (multiaddr: string) => boolean,
  label: string,
): Promise<string> {
  return waitFor(() => network.getMultiaddrs().find(predicate), label);
}

async function waitFor<T>(
  getter: () => Promise<T | undefined> | T | undefined,
  label: string,
): Promise<T> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = await getter();

    if (result !== undefined) {
      return result;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    clearTimeout(timeout!);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function removeTmpRoot(): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.remove(TMP_ROOT);

      return;
    } catch {
      await sleep(250);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
  console.error(error);
  process.exit(1);
  });
