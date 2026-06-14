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
import { PublicIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import orbitDBRuntimeAdapter from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import PrivateNetworkRelayRecordDirectory from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync, randomBytes, randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const RUN_ID = randomUUID();
const TMP_ROOT = path.join(
  ROOT,
  '.tmp',
  `two-private-relay-discovery-e2e-${RUN_ID}`,
);
const NETWORK_ID = randomUUID();
const NETWORK_NAME = `private-relay-discovery-e2e-${RUN_ID}`;
const WAIT_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_TIMEOUT_MS || 60000,
);
const FETCH_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_FETCH_TIMEOUT_MS || 10000,
);
const FALSE_POSITIVE_GUARD_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_FALSE_POSITIVE_GUARD_MS || 1500,
);
const MISSED_INITIAL_PUBLICATION_WAIT_MS = Number(
  process.env
    .PRIVATE_RELAY_DISCOVERY_E2E_MISSED_INITIAL_PUBLICATION_WAIT_MS || 2000,
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

  const publicBootstrap = await createPublicBootstrapNode();
  const publicBootstrapAddress =
    await configurePublicBootstrap(publicBootstrap);
  const networkKey = new PrivateKey(generateNetworkKey());
  const relay = await createNode('relay', networkKey, {
    enableRelayServer: true,
    listenAddresses: ['/ip4/0.0.0.0/tcp/0'],
    relayDataLimitBytes: 16 * 1024 * 1024,
  });
  const leaf = await createNode('leaf', networkKey, {
    listenAddresses: [],
  });

  try {
    const relayAddress = await waitForMultiaddr(
      relay.network,
      (multiaddr) => isDirectTcpMultiaddr(multiaddr),
      'relay direct multiaddr',
    );

    const cid = await assertNoPrivateConnectivityBeforeDiscovery(
      relay.network,
      leaf.network,
    );

    await assertNoPubSubBeforeDiscovery(relay.network, leaf.network);
    await discoverRelayAutomatically(relay, leaf, relayAddress);
    await assertIPFSFetch(relay.network, leaf.network, cid);
    await assertPubSub(relay.network, leaf.network);
    await assertOrbitDBReplication(relay, leaf);

    console.info(
      JSON.stringify(
        {
          leafPeerId: leaf.network.getPeerId(),
          publicBootstrapAddress,
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
      publicBootstrap.stop(),
    ]);
    await removeTmpRoot();
  }
}

function configureEnvironment(): void {
  delete process.env.PIGEON_PRIVATE_RELAY_BOOTSTRAP_MULTIADDRS;
  delete process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS;
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS = '';
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

async function createPublicBootstrapNode(): Promise<IPFSConnection> {
  return PublicIPFS.create({
    listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
    storageLocation: path.join(TMP_ROOT, 'public-bootstrap', 'ipfs'),
  });
}

async function configurePublicBootstrap(
  publicBootstrap: IPFSConnection,
): Promise<string> {
  const publicBootstrapAddress = await waitForConnectionMultiaddr(
    publicBootstrap,
    (multiaddr) => isDirectTcpMultiaddr(multiaddr),
    'public IPFS bootstrap direct multiaddr',
  );

  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'true';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS = publicBootstrapAddress;

  return publicBootstrapAddress;
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

function startRelayRecordPublication(
  relay: PrivateRelayDiscoveryNode,
  relayAddress: string,
): void {
  relay.directory.start(
    relay.network,
    {
      announceAddresses: [relayAddress],
      listenAddresses: [relayAddress],
      relayDataLimitBytes: 16 * 1024 * 1024,
    },
    relay.publicPrivateKey,
  );
}

async function discoverRelayAutomatically(
  relay: PrivateRelayDiscoveryNode,
  leaf: PrivateRelayDiscoveryNode,
  relayAddress: string,
): Promise<void> {
  startRelayRecordPublication(relay, relayAddress);
  await sleep(MISSED_INITIAL_PUBLICATION_WAIT_MS);
  leaf.directory.start(leaf.network, undefined, leaf.publicPrivateKey);

  await waitFor(
    () =>
      leaf.network.getPeers().includes(relay.network.getPeerId())
        ? true
        : undefined,
    'leaf to discover and dial relay from public relay record',
  );
}

async function assertNoPrivateConnectivityBeforeDiscovery(
  provider: IPFSNetwork,
  requester: IPFSNetwork,
): Promise<IPFSId> {
  if (requester.getPeers().includes(provider.getPeerId())) {
    throw new Error(
      'False-positive guard failed: requester is connected before discovery.',
    );
  }

  const bytes = randomBytes(128 * 1024);
  const cid = await provider.addBytes(bytes);

  await expectOfflineCIDMiss(requester, cid);
  await expectRemoteCIDMiss(requester, cid);

  return cid;
}

async function expectOfflineCIDMiss(
  requester: IPFSNetwork,
  cid: IPFSId,
): Promise<void> {
  try {
    await requester.stat(cid, true);
  } catch {
    return;
  }

  throw new Error(
    `False-positive guard failed: CID ${cid.valueOf()} is already local before discovery.`,
  );
}

async function expectRemoteCIDMiss(
  requester: IPFSNetwork,
  cid: IPFSId,
): Promise<void> {
  try {
    await withTimeout(
      (signal) => requester.getBytes(cid, signal),
      FALSE_POSITIVE_GUARD_MS,
      `pre-discovery fetch ${cid.valueOf()}`,
    );
  } catch {
    return;
  }

  throw new Error(
    `False-positive guard failed: CID ${cid.valueOf()} is fetchable before discovery.`,
  );
}

async function assertNoPubSubBeforeDiscovery(
  publisher: IPFSNetwork,
  subscriber: IPFSNetwork,
): Promise<void> {
  const topic = `pigeon-swarm.e2e.${NETWORK_ID}.pre-discovery.${randomUUID()}`;
  const payload = `payload-${randomUUID()}`;
  let received = false;

  await subscriber.subscribePubSub(topic, async (message) => {
    received = message === payload;
  });
  await publisher.publishPubSub(topic, payload);
  await sleep(FALSE_POSITIVE_GUARD_MS);

  if (received) {
    throw new Error(
      'False-positive guard failed: pubsub message arrived before relay discovery.',
    );
  }
}

async function assertIPFSFetch(
  provider: IPFSNetwork,
  requester: IPFSNetwork,
  cid: IPFSId,
): Promise<void> {
  const expectedBytes = await provider.getBytes(cid);
  const fetched = await withTimeout(
    (signal) => requester.getBytes(cid, signal),
    FETCH_TIMEOUT_MS,
    `fetch private IPFS CID ${cid.valueOf()}`,
  );

  if (!expectedBytes.equals(fetched)) {
    throw new Error(`Fetched bytes mismatch for ${cid.valueOf()}`);
  }

  await requester.stat(cid, true);
}

async function assertPubSub(
  publisher: IPFSNetwork,
  subscriber: IPFSNetwork,
): Promise<void> {
  const topic = `pigeon-swarm.e2e.${NETWORK_ID}.pubsub.${randomUUID()}`;
  const payload = `payload-${randomUUID()}`;
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
    id: `orbitdb-proof-${randomUUID()}`,
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

async function waitForConnectionMultiaddr(
  connection: IPFSConnection,
  predicate: (multiaddr: string) => boolean,
  label: string,
): Promise<string> {
  return waitFor(() => connection.getMultiaddrs().find(predicate), label);
}

function isDirectTcpMultiaddr(multiaddr: string): boolean {
  return (
    multiaddr.includes('/ip4/') &&
    multiaddr.includes('/tcp/') &&
    !multiaddr.includes('/p2p-circuit')
  );
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
