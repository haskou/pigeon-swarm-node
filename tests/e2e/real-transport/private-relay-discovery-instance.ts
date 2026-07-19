import 'reflect-metadata';
import 'module-alias/register';

import Kernel from '@haskou/ddd-kernel';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { Libp2pPrivateKeyLike } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/types/Libp2pPrivateKeyLike';
import { PrivateIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import PrivateNetworkRelayRecordDirectory, {
  PrivateRelayListenOptions,
} from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayRecordDirectory';
import PrivateNetworkRelayDirectorySettings from '@app/shared/infrastructure/network/relay/PrivateNetworkRelayDirectorySettings';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { PrivateKey } from '@haskou/value-objects';
import { createHash, randomBytes } from 'crypto';
import { createConnection } from 'net';
import path from 'path';
import readline from 'readline';

const ROLE = requiredEnv('PRIVATE_RELAY_DISCOVERY_E2E_INSTANCE_ROLE') as
  | 'leaf'
  | 'relay';
const NETWORK_ID = requiredEnv('PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_ID');
const NETWORK_NAME = requiredEnv('PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_NAME');
const NETWORK_KEY = requiredEnv('PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_KEY');
const STORAGE_ROOT = requiredEnv('PRIVATE_RELAY_DISCOVERY_E2E_STORAGE_ROOT');
const EXPECTED_RELAY_PEER_ID =
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_EXPECTED_RELAY_PEER_ID;
const WAIT_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_TIMEOUT_MS || 120000,
);
const FETCH_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_FETCH_TIMEOUT_MS || 10000,
);
const FALSE_POSITIVE_GUARD_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_FALSE_POSITIVE_GUARD_MS || 1500,
);
const TCP_REACHABILITY_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_TCP_REACHABILITY_TIMEOUT_MS || 5000,
);
const AUTO_START_RELAY_DISCOVERY =
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_AUTO_START_RELAY_DISCOVERY !== 'false';

type Command = {
  type: string;
  [key: string]: unknown;
};

let network: IPFSNetwork | undefined;
let directory: PrivateNetworkRelayRecordDirectory | undefined;
let publicDirectoryConnection: IPFSConnection | undefined;
let publicDirectoryPrivateKey: Libp2pPrivateKeyLike | undefined;
let orbitdb: OrbitDBInstance | undefined;
let documents: OrbitDBDatabase | undefined;
let relayOptions: PrivateRelayListenOptions | undefined;

async function main(): Promise<void> {
  configureEnvironment();
  configureTestLogger();

  await createPrivateNetwork();

  if (ROLE === 'relay') {
    await startRelay();
  } else {
    emit('leaf-ready', {
      peerId: getNetwork().getPeerId(),
      pid: process.pid,
      storageRoot: STORAGE_ROOT,
    });
  }

  listenForCommands();
}

function configureEnvironment(): void {
  process.env.IPFS_STORAGE_PATH = path.join(STORAGE_ROOT, 'public-ipfs');
  process.env.PIGEON_LOCAL_DB_PATH = path.join(STORAGE_ROOT, 'local-db');
  process.env.PIGEON_PUBLIC_RELAY_RECORDS_PATH = path.join(
    STORAGE_ROOT,
    'publicRelayRecords.json',
  );
}

function configureTestLogger(): void {
  const logToStderr = (level: string, message: string): void => {
    process.stderr.write(`[${ROLE}] ${level} ${message}\n`);
  };

  new Kernel({
    logger: {
      debug: (message: string): void => logToStderr('debug', message),
      error: (message: string): void => logToStderr('error', message),
      info: (message: string): void => logToStderr('info', message),
      warn: (message: string): void => logToStderr('warn', message),
    },
  });
}

async function createPrivateNetwork(): Promise<void> {
  const networkKey = new PrivateKey(NETWORK_KEY);
  const privateNetworkPrivateKey =
    await libp2pKeyAdapter.generateEd25519KeyPair();
  publicDirectoryPrivateKey =
    await libp2pKeyAdapter.generateEd25519KeyPair();
  const config = IPFSNetworkConfig.fromPrimitives({
    id: NETWORK_ID,
    key: networkKey.valueOf(),
    name: NETWORK_NAME,
  });
  const connection = await PrivateIPFS.create({
    key: networkKey,
    name: NETWORK_NAME,
    privateKey: privateNetworkPrivateKey,
    ...(ROLE === 'relay'
      ? {
          enableRelayServer: true,
          listenAddresses: ['/ip4/0.0.0.0/tcp/0'],
          relayDataLimitBytes: 16 * 1024 * 1024,
        }
      : {
          listenAddresses: [],
        }),
    storageLocation: path.join(STORAGE_ROOT, 'private-ipfs'),
  });

  network = new IPFSNetwork(config, connection);
  directory = new PrivateNetworkRelayRecordDirectory(
    new EmbeddedLocalDatabase(),
    new PrivateNetworkRelayDirectorySettings(),
  );
}

async function startRelay(): Promise<void> {
  const relayAddress = await waitFor(
    () => getNetwork().getMultiaddrs().find(isDirectTcpMultiaddr),
    'relay direct TCP multiaddr',
  );
  await assertRelayAddressReachable(relayAddress);

  const bytes = randomBytes(128 * 1024);
  const cid = await getNetwork().addBytes(bytes);
  relayOptions = {
    announceAddresses: [relayAddress],
    listenAddresses: [relayAddress],
    relayDataLimitBytes: 16 * 1024 * 1024,
  };
  publicDirectoryConnection = await getDirectory().configurePublicConnection({
    enableRelayServer: false,
    listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
    localAddressRoutingEnabled: true,
    relayDataLimitBytes: 16 * 1024 * 1024,
    sharedPrivateKey: getPublicDirectoryPrivateKey(),
  });
  await getPublicDirectoryConnection().waitForPeers(WAIT_TIMEOUT_MS);
  const publicProviderAddress = await waitFor(
    () =>
      getPublicDirectoryConnection()
        .getMultiaddrs()
        .find(isDirectTcpMultiaddr),
    'public provider direct TCP multiaddr',
  );

  if (AUTO_START_RELAY_DISCOVERY) {
    await getDirectory().publish(
      getNetwork(),
      relayOptions,
      getPublicDirectoryPrivateKey(),
    );
    startRelayDirectory();
  } else {
    getDirectory().start(
      getNetwork(),
      relayOptions,
      getPublicDirectoryPrivateKey(),
      {
        discoveryEnabled: false,
        publicationEnabled: true,
      },
    );
    await getDirectory().publish(
      getNetwork(),
      relayOptions,
      getPublicDirectoryPrivateKey(),
    );
  }

  emit('relay-ready', {
    advertisedRelayAddress: relayAddress,
    cid: cid.valueOf(),
    peerId: getNetwork().getPeerId(),
    pid: process.pid,
    publicProviderAddress,
    publicProviderPeerId: getPublicDirectoryConnection().getPeerId(),
    sha256: sha256(bytes),
    storageRoot: STORAGE_ROOT,
  });
}

function listenForCommands(): void {
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    let command: Command;

    try {
      command = JSON.parse(line) as Command;
    } catch (error) {
      fail(error);

      return;
    }

    handleCommand(command).catch(fail);
  });
}

async function handleCommand(command: Command): Promise<void> {
  switch (command.type) {
    case 'assert-pre-fetch':
      await assertPreDiscoveryFetchMiss(command);
      return;
    case 'fetch':
      await assertFetch(command);
      return;
    case 'open-orbit':
      await openOrbit(command);
      return;
    case 'publish-pubsub':
      await publishPubSub(command);
      return;
    case 'start-discovery':
      await startDiscovery(command);
      return;
    case 'start-relay-mesh':
      await startRelayMesh(command);
      return;
    case 'stop':
      await stopAndExit();
      return;
    case 'subscribe-pre-pubsub':
      await subscribePreDiscoveryPubSub(command);
      return;
    case 'subscribe-pubsub':
      await subscribePubSub(command);
      return;
    case 'write-orbit':
      await writeOrbit(command);
      return;
    default:
      throw new Error(`Unknown command: ${command.type}`);
  }
}

function startRelayDirectory(): void {
  if (!relayOptions) {
    throw new Error('Relay listen options are not available.');
  }

  getDirectory().start(
    getNetwork(),
    relayOptions,
    getPublicDirectoryPrivateKey(),
    {
      discoveryEnabled: true,
      publicationEnabled: true,
    },
  );
}

async function startRelayMesh(command: Command): Promise<void> {
  if (ROLE !== 'relay') {
    throw new Error('Only relay instances can start relay mesh discovery.');
  }

  const remotePeerId = requiredCommandString(command, 'remotePeerId');

  if (getNetwork().getPeers().includes(remotePeerId)) {
    throw new Error(
      `False-positive guard failed: relay is connected to ${remotePeerId} before mesh discovery.`,
    );
  }

  startRelayDirectory();
  emit('relay-mesh-started', { peerId: remotePeerId });
  await waitFor(
    () =>
      getNetwork().getPeers().includes(remotePeerId)
        ? getNetwork().getPeers()
        : undefined,
    `relay mesh peer ${remotePeerId}`,
  );
  emit('relay-mesh-connected', {
    peerId: remotePeerId,
    peers: getNetwork().getPeers(),
  });
}

async function assertPreDiscoveryFetchMiss(command: Command): Promise<void> {
  const relayPeerId = requiredCommandString(command, 'relayPeerId');
  const cid = new IPFSId(requiredCommandString(command, 'cid'));

  if (getNetwork().getPeers().includes(relayPeerId)) {
    throw new Error(
      `False-positive guard failed: leaf is connected to relay before discovery. relayPeerId=${relayPeerId}`,
    );
  }

  try {
    await getNetwork().stat(cid, true);

    throw new Error(
      `False-positive guard failed: CID ${cid.valueOf()} is already local before discovery.`,
    );
  } catch (error) {
    if (isFalsePositiveError(error)) {
      throw error;
    }
  }

  try {
    await withTimeout(
      (signal) => getNetwork().getBytes(cid, signal),
      FALSE_POSITIVE_GUARD_MS,
      `pre-discovery fetch ${cid.valueOf()}`,
    );

    throw new Error(
      `False-positive guard failed: CID ${cid.valueOf()} is fetchable before discovery.`,
    );
  } catch (error) {
    if (isFalsePositiveError(error)) {
      throw error;
    }
  }

  emit('pre-fetch-ok', {
    cid: cid.valueOf(),
  });
}

async function subscribePreDiscoveryPubSub(command: Command): Promise<void> {
  const topic = requiredCommandString(command, 'topic');
  const payload = requiredCommandString(command, 'payload');
  const guardMs = Number(command.guardMs || FALSE_POSITIVE_GUARD_MS);
  let received = false;

  await getNetwork().subscribePubSub(topic, async (message) => {
    if (message === payload) {
      received = true;
    }
  });
  emit('pre-pubsub-subscribed', { topic });
  await sleep(guardMs);

  if (received) {
    throw new Error(
      `False-positive guard failed: pubsub payload arrived before discovery. topic=${topic}`,
    );
  }

  emit('pre-pubsub-ok', { topic });
}

async function startDiscovery(command: Command): Promise<void> {
  const relayPeerId =
    requiredCommandString(command, 'relayPeerId') ||
    requiredEnv('PRIVATE_RELAY_DISCOVERY_E2E_EXPECTED_RELAY_PEER_ID');
  const publicProviderPeerId = requiredCommandString(
    command,
    'publicProviderPeerId',
  );

  if (EXPECTED_RELAY_PEER_ID && relayPeerId !== EXPECTED_RELAY_PEER_ID) {
    throw new Error('Unexpected relay peer id for discovery command.');
  }

  publicDirectoryConnection = await getDirectory().configurePublicConnection({
    enableRelayServer: false,
    listenAddresses: [],
    localAddressRoutingEnabled: true,
    relayDataLimitBytes: 16 * 1024 * 1024,
    sharedPrivateKey: getPublicDirectoryPrivateKey(),
  });
  await getPublicDirectoryConnection().waitForPeers(WAIT_TIMEOUT_MS);

  if (getPublicDirectoryConnection().getPeers().includes(publicProviderPeerId)) {
    throw new Error(
      `False-positive guard failed: leaf public connection already has relay provider ${publicProviderPeerId}.`,
    );
  }

  emit('public-provider-pre-discovery-ok', { publicProviderPeerId });
  getDirectory().start(
    getNetwork(),
    undefined,
    getPublicDirectoryPrivateKey(),
    {
      discoveryEnabled: true,
      publicationEnabled: false,
    },
  );
  await waitFor(
    () =>
      getNetwork().getPeers().includes(relayPeerId)
        ? getNetwork().getPeers()
        : undefined,
    `leaf to discover relay peer ${relayPeerId}`,
  );
  await waitFor(
    () =>
      getPublicDirectoryConnection().getPeers().includes(publicProviderPeerId)
        ? getPublicDirectoryConnection().getPeers()
        : undefined,
    `leaf to dial public relay provider ${publicProviderPeerId}`,
  );
  emit('connected', {
    peerId: relayPeerId,
    peers: getNetwork().getPeers(),
    publicProviderPeerId,
  });
}

async function assertFetch(command: Command): Promise<void> {
  const cid = new IPFSId(requiredCommandString(command, 'cid'));
  const expectedSha256 = requiredCommandString(command, 'sha256');
  const fetched = await withTimeout(
    (signal) => getNetwork().getBytes(cid, signal),
    FETCH_TIMEOUT_MS,
    `fetch private IPFS CID ${cid.valueOf()}`,
  );

  if (sha256(fetched) !== expectedSha256) {
    throw new Error(`Fetched bytes mismatch for ${cid.valueOf()}`);
  }

  await getNetwork().stat(cid, true);
  emit('ipfs-fetch-ok', {
    cid: cid.valueOf(),
    sha256: expectedSha256,
  });
}

async function subscribePubSub(command: Command): Promise<void> {
  const topic = requiredCommandString(command, 'topic');
  const payload = requiredCommandString(command, 'payload');

  await getNetwork().subscribePubSub(topic, async (message) => {
    if (message === payload) {
      emit('pubsub-received', {
        payload,
        topic,
      });
    }
  });
  emit('pubsub-subscribed', { topic });
}

async function publishPubSub(command: Command): Promise<void> {
  const topic = requiredCommandString(command, 'topic');
  const payload = requiredCommandString(command, 'payload');

  await getNetwork().publishPubSub(topic, payload);
  emit('pubsub-published', {
    payload,
    topic,
  });
}

async function openOrbit(command: Command): Promise<void> {
  const address = requiredCommandString(command, 'address');
  const expectedDocumentId =
    typeof command.expectedDocumentId === 'string'
      ? command.expectedDocumentId
      : undefined;

  orbitdb = await orbitDBRuntimeAdapter.createOrbitDB({
    directory: path.join(STORAGE_ROOT, 'orbitdb'),
    id: `${ROLE}-${getNetwork().getPeerId()}`,
    ipfs: getNetwork().getHeliaCore(),
  });
  const AccessController =
    await orbitDBRuntimeAdapter.createPrivateNetworkAccessController();
  const Database = await orbitDBRuntimeAdapter.createDocumentsDatabase();

  documents = await orbitdb.open(address, {
    AccessController,
    Database,
    type: 'documents',
  });

  if (expectedDocumentId) {
    waitForOrbitDocument(address, expectedDocumentId).catch(fail);
  }

  emit('orbit-open', {
    address,
  });
}

async function writeOrbit(command: Command): Promise<void> {
  if (!documents) {
    throw new Error('OrbitDB documents database is not open.');
  }

  const document = command.document;

  if (!isRecord(document)) {
    throw new Error('Invalid OrbitDB document command payload.');
  }

  await documents.put?.(document);
  emit('orbit-written', {
    document,
  });
}

async function waitForOrbitDocument(
  address: string,
  documentId: string,
): Promise<void> {
  if (!documents) {
    throw new Error('OrbitDB documents database is not open.');
  }

  await waitFor(async () => {
    const results = await documents?.query?.((candidate) => {
      return candidate.id === documentId;
    });

    return results && results.length > 0 ? true : undefined;
  }, `OrbitDB document ${documentId}`);
  emit('orbit-replicated', {
    address,
    documentId,
  });
}

async function stopAndExit(): Promise<void> {
  await stopResources();
  emit('stopped', {
    role: ROLE,
  });
  process.exit(0);
}

async function stopResources(): Promise<void> {
  await Promise.allSettled([
    documents?.close(),
    orbitdb?.stop(),
    directory?.stopPublicConnection(),
  ]);
  directory?.stop(NETWORK_ID);
  await network?.stop();
}

function getNetwork(): IPFSNetwork {
  if (!network) {
    throw new Error('Private network has not been created.');
  }

  return network;
}

function getDirectory(): PrivateNetworkRelayRecordDirectory {
  if (!directory) {
    throw new Error('Private relay directory has not been created.');
  }

  return directory;
}

function getPublicDirectoryPrivateKey(): Libp2pPrivateKeyLike {
  if (!publicDirectoryPrivateKey) {
    throw new Error('Public private key has not been created.');
  }

  return publicDirectoryPrivateKey;
}

function getPublicDirectoryConnection(): IPFSConnection {
  if (!publicDirectoryConnection) {
    throw new Error('Public directory connection has not been created.');
  }

  return publicDirectoryConnection;
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function requiredCommandString(command: Command, key: string): string {
  const value = command[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing command string field: ${key}`);
  }

  return value;
}

function isFalsePositiveError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('False-positive guard failed:')
  );
}

function isDirectTcpMultiaddr(multiaddr: string): boolean {
  return (
    multiaddr.includes('/ip4/') &&
    multiaddr.includes('/tcp/') &&
    !multiaddr.includes('/p2p-circuit')
  );
}

async function assertRelayAddressReachable(multiaddr: string): Promise<void> {
  const endpoint = parseTcpMultiaddr(multiaddr);

  if (!endpoint) {
    throw new Error(`Relay multiaddr is not a TCP endpoint: ${multiaddr}`);
  }

  await withTimeout(
    () => connectToTcpEndpoint(endpoint.host, endpoint.port),
    TCP_REACHABILITY_TIMEOUT_MS,
    `TCP connection to advertised relay address ${multiaddr}`,
  );
}

function parseTcpMultiaddr(
  multiaddr: string,
): { host: string; port: number } | undefined {
  const match = multiaddr.match(/\/(?:ip4|dns4)\/([^/]+)\/tcp\/(\d+)/);

  if (!match) {
    return undefined;
  }

  const [, rawHost, rawPort] = match;
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    return undefined;
  }

  return {
    host: rawHost === '0.0.0.0' ? '127.0.0.1' : rawHost,
    port,
  };
}

async function connectToTcpEndpoint(host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });

    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('error', reject);
  });
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

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function emit(type: string, payload: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ ...payload, type })}\n`);
}

function fail(error: unknown): void {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error));

  emit('error', {
    message: normalizedError.message,
    stack: normalizedError.stack,
  });
  process.stderr.write(`${normalizedError.stack || normalizedError.message}\n`);
  stopResources()
    .catch((): void => {})
    .finally(() => process.exit(1));
}

process.on('SIGTERM', () => {
  stopResources()
    .catch((): void => {})
    .finally(() => process.exit(0));
});
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

main().catch(fail);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
