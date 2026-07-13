import 'reflect-metadata';
import 'module-alias/register';

import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import OrbitDBIdentityMetadataProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataProjection';
import OrbitDBKeychainMetadataIndex from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataIndex';
import OrbitDBKeychainMetadataProjection from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataProjection';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Kernel from '@haskou/ddd-kernel';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { IPFSOptions } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSOptions';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-private-orbitdb-spike-e2e');
const WAIT_TIMEOUT_MS = 15000;
const NETWORK_ID = 'orbitdb-private-network';
const NETWORK_NAME = 'orbitdb-private-sync-e2e';
const IDENTITY_ID =
  'MCowBQYDK2VwAyEAj3dYus5qe3I0IrvPl/oEM+678lbO9+1vzJSlXnlb0v4=';

type OrbitDatabase = {
  access?: {
    write?: string[];
  };
  add?(value: unknown): Promise<string>;
  address: string;
  all?(): Promise<Array<{ key?: string; value: unknown }>>;
  close(): Promise<void>;
  del?(key: string): Promise<string>;
  events: {
    on(event: 'error', handler: (error: unknown) => void): void;
    on(event: 'update', handler: (entry: OrbitEntry) => void): void;
  };
  get?(key: string): Promise<{ key?: string; value: unknown } | unknown>;
  put?(keyOrDocument: string | Record<string, unknown>, value?: unknown): Promise<string>;
  query?(matcher: (document: Record<string, unknown>) => boolean): Promise<
    Array<Record<string, unknown>>
  >;
};

type OrbitDbInstance = {
  identity: {
    id: string;
  };
  open(
    address: string,
    options?: Record<string, unknown>,
  ): Promise<OrbitDatabase>;
  stop(): Promise<void>;
};

type OrbitEntry = {
  payload?: {
    value?: unknown;
  };
};

type PubSubEventLike = {
  detail: {
    data?: Uint8Array;
    msg?: {
      data?: Uint8Array;
      topic?: string;
    };
    topic?: string;
  };
};

type PubSubLike = {
  addEventListener(
    event: 'gossipsub:message' | 'message',
    listener: (event: PubSubEventLike) => void,
  ): void;
  publish(topic: string, data: Uint8Array): Promise<void>;
  subscribe(topic: string): Promise<void>;
};

type OrbitDbCore = {
  Documents(options?: { indexBy?: string }): unknown;
  IPFSAccessController(options?: { write?: string[] }): unknown;
  createOrbitDB(options: {
    directory: string;
    id: string;
    ipfs: HeliaInstance;
  }): Promise<OrbitDbInstance>;
};

type PrivateOrbitNode = {
  helia: HeliaInstance;
  name: string;
  orbitdb?: OrbitDbInstance;
};

type StoreAddresses = {
  communities: string;
  heads: string;
  identities: string;
  keychains: string;
  messages: string;
  notifications: string;
  requests: string;
};

type PrivateOrbitDbStores = {
  communities: OrbitDatabase;
  heads: OrbitDatabase;
  identities: OrbitDatabase;
  keychains: OrbitDatabase;
  messages: OrbitDatabase;
  notifications: OrbitDatabase;
  requests: OrbitDatabase;
};

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
  process.env.NODE_ENV = 'test';
  configureTestLogger();

  const orbitdbCore = (await import('@orbitdb/core')) as OrbitDbCore;
  const networkKey = new PrivateKey(generateNetworkKey());
  const relay = await createNode('relay', networkKey, {
    enableRelayServer: true,
    listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
    relayDataLimitBytes: 16 * 1024 * 1024,
  });
  const nodes: PrivateOrbitNode[] = [relay];

  try {
    const relayAddress = await waitForMultiaddr(
      relay.helia,
      (multiaddr) =>
        multiaddr.includes('/ip4/127.0.0.1/tcp/') &&
        !multiaddr.includes('/p2p-circuit'),
      'relay direct multiaddr',
    );
    const provider = await createNode('provider', networkKey, {
      listenAddresses: ['/ip4/127.0.0.1/tcp/0', `${relayAddress}/p2p-circuit`],
    });
    const requester = await createNode('requester', networkKey, {
      listenAddresses: ['/ip4/127.0.0.1/tcp/0', `${relayAddress}/p2p-circuit`],
    });
    const intruder = await createNode('intruder', networkKey, {
      listenAddresses: ['/ip4/127.0.0.1/tcp/0', `${relayAddress}/p2p-circuit`],
    });
    nodes.push(provider, requester, intruder);

    await connectThroughRelay(relayAddress, provider.helia, requester.helia);
    await assertPrivatePubSubWorks(provider.helia, requester.helia);

    provider.orbitdb = await createOrbitDb(orbitdbCore, provider);
    requester.orbitdb = await createOrbitDb(orbitdbCore, requester);

    const writers = [
      provider.orbitdb.identity.id,
      requester.orbitdb.identity.id,
    ];
    const providerStores = await openStores(
      orbitdbCore,
      provider.orbitdb,
      writers,
    );
    const requesterStores = await openStores(
      orbitdbCore,
      requester.orbitdb,
      writers,
    );
    assertSameStoreAddresses(providerStores, requesterStores);
    await waitForOrbitPeer(providerStores.identities);
    await waitForOrbitPeer(requesterStores.identities);
    await assertAccessControl(providerStores.identities, [
      provider.orbitdb.identity.id,
      requester.orbitdb.identity.id,
    ]);

    await writeReplicatedDocuments(providerStores);

    await assertQueryViability(requesterStores);
    await assertProjectedMetadataIndexes(requesterStores);
    await assertUnauthorizedWriteIsRejected(
      orbitdbCore,
      intruder,
      writers,
    );

    const restartedRequester = await restartOrbitDb(
      orbitdbCore,
      requester,
      writers,
    );
    await assertQueryViability(restartedRequester.stores);
    await assertProjectedMetadataIndexes(restartedRequester.stores);
    await restartedRequester.orbitdb.stop();

    console.info(
      JSON.stringify(
        {
          replicatedStoreCount: Object.keys(getAddresses(providerStores)).length,
          providerPeerId: getPeerId(provider.helia),
          requesterPeerId: getPeerId(requester.helia),
          projectedMetadataIndexes: ['identities', 'keychains'],
          result: 'PASS',
          stores: Object.keys(getAddresses(providerStores)),
          transportDsn: 'private-ipfs-circuit-relay://orbitdb',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled(nodes.map((node) => stopNode(node)));
    await fs.remove(TMP_ROOT);
  }
}

function configureTestLogger(): void {
  const noop = (): void => undefined;

  new Kernel({
    logger: {
      debug: noop,
      error: (message: string): void => console.error(message),
      info: noop,
      warn: (message: string): void => console.warn(message),
    },
  });
}

async function createNode(
  name: string,
  networkKey: PrivateKey,
  options: {
    enableRelayServer?: boolean;
    listenAddresses: string[];
    relayDataLimitBytes?: number;
  },
): Promise<PrivateOrbitNode> {
  const ipfsOptions: IPFSOptions = {
    storageLocation: path.join(TMP_ROOT, name, 'ipfs'),
    ...options,
  };

  return {
    helia: await HeliaIPFS.createPrivateHeliaCore(
      ipfsOptions,
      networkKey,
      NETWORK_NAME,
    ),
    name,
  };
}

async function createOrbitDb(
  orbitdbCore: OrbitDbCore,
  node: PrivateOrbitNode,
): Promise<OrbitDbInstance> {
  return orbitdbCore.createOrbitDB({
    directory: path.join(TMP_ROOT, node.name, 'orbitdb'),
    id: `${NETWORK_ID}:${node.name}`,
    ipfs: node.helia,
  });
}

async function openStores(
  orbitdbCore: OrbitDbCore,
  orbitdb: OrbitDbInstance,
  writers: string[],
): Promise<PrivateOrbitDbStores> {
  const AccessController = orbitdbCore.IPFSAccessController({ write: writers });

  const stores = {
    communities: await openDocuments(
      orbitdbCore,
      orbitdb,
      `${NETWORK_ID}/documents/communities`,
      AccessController,
    ),
    heads: await orbitdb.open(`${NETWORK_ID}/keyvalue/heads`, {
      AccessController,
      type: 'keyvalue',
    }),
    identities: await openDocuments(
      orbitdbCore,
      orbitdb,
      `${NETWORK_ID}/documents/identities`,
      AccessController,
    ),
    keychains: await openDocuments(
      orbitdbCore,
      orbitdb,
      `${NETWORK_ID}/documents/keychains`,
      AccessController,
    ),
    messages: await openDocuments(
      orbitdbCore,
      orbitdb,
      `${NETWORK_ID}/documents/messages`,
      AccessController,
    ),
    notifications: await openDocuments(
      orbitdbCore,
      orbitdb,
      `${NETWORK_ID}/documents/notifications`,
      AccessController,
    ),
    requests: await openDocuments(
      orbitdbCore,
      orbitdb,
      `${NETWORK_ID}/documents/requests`,
      AccessController,
    ),
  };

  registerSyncErrorLoggers(stores);

  return stores;
}

function registerSyncErrorLoggers(stores: PrivateOrbitDbStores): void {
  for (const [storeName, store] of Object.entries(stores)) {
    store.events.on('error', (error: unknown) => {
      console.warn(
        `OrbitDB sync error handled in real-transport spike: store=${storeName} error=${String(error)}`,
      );
    });
  }
}

async function openDocuments(
  orbitdbCore: OrbitDbCore,
  orbitdb: OrbitDbInstance,
  address: string,
  AccessController?: unknown,
): Promise<OrbitDatabase> {
  return orbitdb.open(address, {
    ...(AccessController ? { AccessController } : {}),
    Database: orbitdbCore.Documents({ indexBy: 'id' }),
    type: 'documents',
  });
}

function assertSameStoreAddresses(
  providerStores: PrivateOrbitDbStores,
  requesterStores: PrivateOrbitDbStores,
): void {
  const providerAddresses = getAddresses(providerStores);
  const requesterAddresses = getAddresses(requesterStores);

  for (const key of Object.keys(providerAddresses) as Array<keyof StoreAddresses>) {
    if (providerAddresses[key] !== requesterAddresses[key]) {
      throw new Error(
        `OrbitDB deterministic store address mismatch for ${key}: ` +
          `${providerAddresses[key]} !== ${requesterAddresses[key]}`,
      );
    }
  }
}

function getAddresses(stores: PrivateOrbitDbStores): StoreAddresses {
  return {
    communities: stores.communities.address,
    heads: stores.heads.address,
    identities: stores.identities.address,
    keychains: stores.keychains.address,
    messages: stores.messages.address,
    notifications: stores.notifications.address,
    requests: stores.requests.address,
  };
}

async function restartOrbitDb(
  orbitdbCore: OrbitDbCore,
  node: PrivateOrbitNode,
  writers: string[],
): Promise<{
  orbitdb: OrbitDbInstance;
  stores: PrivateOrbitDbStores;
}> {
  await node.orbitdb?.stop();
  const orbitdb = await createOrbitDb(orbitdbCore, node);
  const stores = await openStores(orbitdbCore, orbitdb, writers);

  return { orbitdb, stores };
}

async function connectThroughRelay(
  relayAddress: string,
  provider: HeliaInstance,
  requester: HeliaInstance,
): Promise<void> {
  await dial(provider, relayAddress);
  await dial(requester, relayAddress);

  const providerCircuitAddress = await waitForMultiaddr(
    provider,
    (multiaddr) => multiaddr.includes('/p2p-circuit'),
    'provider circuit relay multiaddr',
  );
  const requesterCircuitAddress = await waitForMultiaddr(
    requester,
    (multiaddr) => multiaddr.includes('/p2p-circuit'),
    'requester circuit relay multiaddr',
  );

  await dial(requester, providerCircuitAddress);
  await dial(provider, requesterCircuitAddress);
  await waitForPeer(requester, getPeerId(provider));
  await waitForPeer(provider, getPeerId(requester));
}

async function assertPrivatePubSubWorks(
  publisher: HeliaInstance,
  subscriber: HeliaInstance,
): Promise<void> {
  const topic = `${NETWORK_ID}/transport/pubsub-check`;
  const payload = `pubsub-${Date.now()}`;
  const pubsub = getPubSub(subscriber);
  const receivedPayload = new Promise<string>((resolve) => {
    const listener = (event: PubSubEventLike): void => {
      const message = event.detail.msg || event.detail;

      if (message.topic !== topic || !message.data) {
        return;
      }

      resolve(new TextDecoder().decode(message.data));
    };

    pubsub.addEventListener('message', listener);
    pubsub.addEventListener('gossipsub:message', listener);
  });

  await pubsub.subscribe(topic);
  await sleep(1000);
  await getPubSub(publisher).publish(topic, new TextEncoder().encode(payload));

  const received = await waitForPromise(
    receivedPayload,
    `pubsub payload for ${topic}`,
  );

  if (received !== payload) {
    throw new Error('Private IPFS pubsub delivered an unexpected payload');
  }
}

function getPubSub(helia: HeliaInstance): PubSubLike {
  const services = helia.libp2p.services as unknown as {
    pubsub?: PubSubLike;
  };

  if (!services.pubsub) {
    throw new Error('Private IPFS node does not expose pubsub');
  }

  return services.pubsub;
}

async function dial(helia: HeliaInstance, multiaddr: string): Promise<void> {
  await helia.libp2p.dial(await heliaRuntimeAdapter.createMultiaddr(multiaddr));
}

async function waitForMultiaddr(
  helia: HeliaInstance,
  predicate: (multiaddr: string) => boolean,
  label: string,
): Promise<string> {
  return waitFor(() => getMultiaddrs(helia).find(predicate), label);
}

async function waitForPeer(
  helia: HeliaInstance,
  peerId: string,
): Promise<void> {
  await waitFor(
    () => getPeers(helia).find((connectedPeerId) => connectedPeerId === peerId),
    `peer ${peerId}`,
  );
}

async function waitForOrbitPeer(store: OrbitDatabase): Promise<void> {
  await waitFor(
    () => (getOrbitPeerCount(store) > 0 ? true : undefined),
    `orbitdb peer for ${store.address}`,
  );
}

function getOrbitPeerCount(store: OrbitDatabase): number {
  const maybeStore = store as OrbitDatabase & {
    peers?: Set<string>;
  };

  return maybeStore.peers?.size || 0;
}

function getMultiaddrs(helia: HeliaInstance): string[] {
  return helia.libp2p.getMultiaddrs().map((multiaddr) => multiaddr.toString());
}

function getPeers(helia: HeliaInstance): string[] {
  return helia.libp2p.getPeers().map((peer) => peer.toString());
}

function getPeerId(helia: HeliaInstance): string {
  return helia.libp2p.peerId.toString();
}

function generateNetworkKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');

  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

async function writeReplicatedDocuments(stores: PrivateOrbitDbStores): Promise<void> {
  await stores.identities.put?.({
    cid: 'cid-identity-hasko-v2',
    handle: 'hasko',
    id: IDENTITY_ID,
    identityId: IDENTITY_ID,
    lastEventId: 'identity-event-hasko-v2',
    networkIds: [NETWORK_ID],
    receivedAt: 2,
    version: 2,
  });
  await stores.keychains.put?.({
    cid: 'cid-keychain-hasko-v4',
    id: 'cid-keychain-hasko-v4',
    networkIds: [NETWORK_ID],
    ownerIdentityId: IDENTITY_ID,
    receivedAt: 4,
    version: 4,
  });
  await stores.keychains.put?.({
    cid: 'cid-keychain-hasko-v5',
    id: 'cid-keychain-hasko-v5',
    networkIds: [NETWORK_ID],
    ownerIdentityId: IDENTITY_ID,
    receivedAt: 5,
    version: 5,
  });
  await stores.communities.put?.({
    channelIds: ['channel-general'],
    id: 'community-alpha',
    memberIds: ['identity-hasko', 'identity-maria'],
  });
  await stores.messages.put?.({
    body: 'Edited payload reference',
    conversationId: 'group:orbitdb-spike',
    createdAt: 1781020000000,
    editedAt: 1781020005000,
    id: 'message-1',
  });
  await stores.heads.put?.('latest-message:group:orbitdb-spike', 'message-1');
  await stores.heads.put?.('read-marker:group:orbitdb-spike:identity-maria', {
    messageId: 'message-1',
    readAt: 1781020006000,
  });
  await stores.notifications.put?.({
    id: 'notification-1',
    identityId: 'identity-maria',
    scopeId: 'group:orbitdb-spike',
  });
  await stores.requests.put?.({
    communityId: 'community-alpha',
    id: 'invite-1',
    identityId: 'identity-maria',
    kind: 'invite',
    status: 'pending',
  });
  await stores.requests.put?.({
    communityId: 'community-alpha',
    id: 'join-request-1',
    identityId: 'identity-yuki',
    kind: 'join_request',
    status: 'pending',
  });
}

async function assertAccessControl(
  replicatedStore: OrbitDatabase,
  expectedWriters: string[],
): Promise<void> {
  const writers = replicatedStore.access?.write || [];

  for (const expectedWriter of expectedWriters) {
    if (!writers.includes(expectedWriter)) {
      throw new Error(`Missing OrbitDB writer ${expectedWriter}`);
    }
  }
}

async function assertUnauthorizedWriteIsRejected(
  orbitdbCore: OrbitDbCore,
  node: PrivateOrbitNode,
  writers: string[],
): Promise<void> {
  node.orbitdb = await createOrbitDb(orbitdbCore, node);
  const stores = await openStores(orbitdbCore, node.orbitdb, writers);

  try {
    let rejected = false;

    try {
      await stores.identities.put?.({
        cid: 'cid-intruder',
        id: 'identity-intruder',
      });
    } catch {
      rejected = true;
    }

    if (!rejected) {
      throw new Error('Unauthorized OrbitDB write was accepted');
    }
  } finally {
    await node.orbitdb.stop();
    node.orbitdb = undefined;
  }
}

async function assertQueryViability(stores: PrivateOrbitDbStores): Promise<void> {
  await waitFor(async () => {
    const identity = await getDocumentValue(stores.identities, IDENTITY_ID);

    return identity?.cid === 'cid-identity-hasko-v2' ? true : undefined;
  }, 'latest identity replication');

  await waitFor(async () => {
    const keychain = await getDocumentValue(
      stores.keychains,
      'cid-keychain-hasko-v5',
    );

    return keychain?.cid === 'cid-keychain-hasko-v5' ? true : undefined;
  }, 'latest keychain replication');

  await waitFor(async () => {
    const messages = await stores.messages.query?.(
      (message) => message.conversationId === 'group:orbitdb-spike',
    );
    const [message] = messages || [];

    return messages?.length === 1 &&
      message.id === 'message-1' &&
      message.body === 'Edited payload reference' &&
      message.editedAt === 1781020005000
      ? true
      : undefined;
  }, 'message timeline/edit replication');

  await waitFor(async () => {
    const readMarker = await stores.heads.get?.(
      'read-marker:group:orbitdb-spike:identity-maria',
    );

    return isRecord(readMarker) && readMarker.messageId === 'message-1'
      ? true
      : undefined;
  }, 'read marker keyvalue replication');

  await waitFor(async () => {
    const notifications = await stores.notifications.query?.(
      (notification) => notification.identityId === 'identity-maria',
    );

    return notifications?.length === 1 ? true : undefined;
  }, 'notification query replication');

  await waitFor(async () => {
    const inviteRequests = await stores.requests.query?.(
      (request) =>
        request.communityId === 'community-alpha' &&
        request.identityId === 'identity-maria',
    );
    const joinRequests = await stores.requests.query?.(
      (request) =>
        request.communityId === 'community-alpha' &&
        request.kind === 'join_request',
    );

    return inviteRequests?.length === 1 && joinRequests?.length === 1
      ? true
      : undefined;
  }, 'invite and membership request replication');

  await waitFor(async () => {
    const latestMessage = await stores.heads.get?.(
      'latest-message:group:orbitdb-spike',
    );

    return latestMessage === 'message-1' ? true : undefined;
  }, 'latest message keyvalue replication');
}

async function assertProjectedMetadataIndexes(
  stores: PrivateOrbitDbStores,
): Promise<void> {
  const identityId = new IdentityId(IDENTITY_ID);
  const registry = new OrbitDBReplicatedStateRegistry();
  const identityIndex = new OrbitDBIdentityMetadataIndex(registry);
  const keychainIndex = new OrbitDBKeychainMetadataIndex(registry);

  await assertMetadataHeadsAreAbsent(stores);
  await registry.register(
    NETWORK_ID,
    stores as unknown as OrbitDBPrivateNetworkStores,
  );
  await Promise.all([
    new OrbitDBIdentityMetadataProjection(registry, identityIndex).start(),
    new OrbitDBKeychainMetadataProjection(registry, keychainIndex).start(),
  ]);

  const identities = await identityIndex.findByHandle(
    new ProfileHandle('hasko'),
  );
  const keychains = await keychainIndex.findByOwnerIdentityId(identityId);

  if (identities[0]?.cid !== 'cid-identity-hasko-v2') {
    throw new Error('Replicated identity metadata was not projected by handle');
  }

  if (
    keychains[0]?.cid !== 'cid-keychain-hasko-v5' ||
    keychains[1]?.cid !== 'cid-keychain-hasko-v4'
  ) {
    throw new Error('Replicated keychain versions were not projected by owner');
  }

  registry.clear();
}

async function assertMetadataHeadsAreAbsent(
  stores: PrivateOrbitDbStores,
): Promise<void> {
  const identityHead = await stores.heads.get?.(`identity:${IDENTITY_ID}`);
  const keychainHead = await stores.heads.get?.(`keychain:${IDENTITY_ID}`);

  if (identityHead !== undefined || keychainHead !== undefined) {
    throw new Error(
      'Metadata projection E2E requires replicated documents without heads',
    );
  }
}

async function getDocumentValue(
  store: OrbitDatabase,
  key: string,
): Promise<Record<string, unknown> | undefined> {
  const entry = await store.get?.(key);

  if (
    typeof entry === 'object' &&
    entry !== null &&
    'value' in entry &&
    isRecord(entry.value)
  ) {
    return entry.value;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function stopNode(node: PrivateOrbitNode): Promise<void> {
  await node.orbitdb?.stop();
  await node.helia.stop();
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

async function waitForPromise<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${label}`)),
          WAIT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
