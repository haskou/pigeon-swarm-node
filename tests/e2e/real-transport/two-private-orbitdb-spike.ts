import 'reflect-metadata';
import 'module-alias/register';

import Kernel from '@haskou/ddd-kernel';
import heliaRuntimeAdapter, {
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { IPFSOptions } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSOptions';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-private-orbitdb-spike-e2e');
const WAIT_TIMEOUT_MS = 15000;
const NETWORK_ID = 'orbitdb-private-network';
const NETWORK_NAME = 'orbitdb-private-sync-e2e';

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
  events: string;
  heads: string;
  identities: string;
  keychains: string;
  messages: string;
  notifications: string;
  requests: string;
};

type ProjectionStores = {
  communities: OrbitDatabase;
  heads: OrbitDatabase;
  identities: OrbitDatabase;
  keychains: OrbitDatabase;
  messages: OrbitDatabase;
  notifications: OrbitDatabase;
  requests: OrbitDatabase;
};

type DomainEvent =
  | {
      cid: string;
      identityId: string;
      type: 'identity.updated';
    }
  | {
      cid: string;
      identityId: string;
      type: 'keychain.updated';
    }
  | {
      channelId: string;
      communityId: string;
      memberIds: string[];
      type: 'community.created';
    }
  | {
      body: string;
      conversationId: string;
      createdAt: number;
      messageId: string;
      type: 'message.created';
    }
  | {
      body: string;
      editedAt: number;
      messageId: string;
      type: 'message.edited';
    }
  | {
      conversationId: string;
      identityId: string;
      messageId: string;
      readAt: number;
      type: 'message.read';
    }
  | {
      identityId: string;
      notificationId: string;
      scopeId: string;
      type: 'notification.created';
    }
  | {
      communityId: string;
      inviteId: string;
      invitedIdentityId: string;
      status: 'pending';
      type: 'community.invite.created';
    }
  | {
      communityId: string;
      requestId: string;
      requesterIdentityId: string;
      status: 'pending';
      type: 'community.membership_request.created';
    };

type DomainEventEnvelope = {
  event: DomainEvent;
  eventId: string;
};

type TestLogger = {
  debug(message: string): void;
  error(message: string): void;
  info(message: string): void;
  warn(message: string): void;
};

class OrbitDbProjection {
  private readonly processedEventIds = new Set<string>();
  private readonly websocketEvents: string[] = [];

  constructor(
    private readonly eventStore: OrbitDatabase,
    private readonly stores: ProjectionStores,
  ) {}

  public getWebsocketEvents(): string[] {
    return [...this.websocketEvents];
  }

  public async start(): Promise<void> {
    await this.replayExistingEvents();
    this.eventStore.events.on('update', (entry) => {
      this.projectEntry(entry).catch((error: unknown) => {
        throw error;
      });
    });
  }

  private async replayExistingEvents(): Promise<void> {
    const entries = await this.eventStore.all?.();

    for (const entry of entries || []) {
      await this.projectValue(entry.value);
    }
  }

  private async projectEntry(entry: OrbitEntry): Promise<void> {
    await this.projectValue(entry.payload?.value);
  }

  private async projectValue(value: unknown): Promise<void> {
    if (!this.isDomainEventEnvelope(value)) {
      return;
    }

    if (this.processedEventIds.has(value.eventId)) {
      return;
    }

    this.processedEventIds.add(value.eventId);
    await this.projectDomainEvent(value.event);
    this.websocketEvents.push(value.event.type);
  }

  private isDomainEventEnvelope(value: unknown): value is DomainEventEnvelope {
    return (
      typeof value === 'object' &&
      value !== null &&
      'eventId' in value &&
      'event' in value
    );
  }

  private async projectDomainEvent(event: DomainEvent): Promise<void> {
    if (event.type === 'identity.updated') {
      await this.putDocument(this.stores.identities, {
        cid: event.cid,
        id: event.identityId,
      });

      return;
    }

    if (event.type === 'keychain.updated') {
      await this.putDocument(this.stores.keychains, {
        cid: event.cid,
        id: event.identityId,
      });

      return;
    }

    if (event.type === 'community.created') {
      await this.putDocument(this.stores.communities, {
        channelIds: [event.channelId],
        id: event.communityId,
        memberIds: event.memberIds,
      });

      return;
    }

    if (event.type === 'message.created') {
      await this.putDocument(this.stores.messages, {
        body: event.body,
        conversationId: event.conversationId,
        createdAt: event.createdAt,
        editedAt: null,
        id: event.messageId,
      });
      await this.putKey(
        `latest-message:${event.conversationId}`,
        event.messageId,
      );

      return;
    }

    if (event.type === 'message.edited') {
      const existing = await this.getDocument(this.stores.messages, event.messageId);
      await this.putDocument(this.stores.messages, {
        ...existing,
        body: event.body,
        editedAt: event.editedAt,
        id: event.messageId,
      });

      return;
    }

    if (event.type === 'message.read') {
      await this.putKey(
        `read-marker:${event.conversationId}:${event.identityId}`,
        {
          messageId: event.messageId,
          readAt: event.readAt,
        },
      );

      return;
    }

    if (event.type === 'notification.created') {
      await this.putDocument(this.stores.notifications, {
        id: event.notificationId,
        identityId: event.identityId,
        scopeId: event.scopeId,
      });

      return;
    }

    if (event.type === 'community.invite.created') {
      await this.putDocument(this.stores.requests, {
        communityId: event.communityId,
        id: event.inviteId,
        identityId: event.invitedIdentityId,
        kind: 'invite',
        status: event.status,
      });

      return;
    }

    await this.putDocument(this.stores.requests, {
      communityId: event.communityId,
      id: event.requestId,
      identityId: event.requesterIdentityId,
      kind: 'join_request',
      status: event.status,
    });
  }

  private async getDocument(
    store: OrbitDatabase,
    key: string,
  ): Promise<Record<string, unknown>> {
    const entry = await store.get?.(key);

    if (
      typeof entry === 'object' &&
      entry !== null &&
      'value' in entry &&
      typeof entry.value === 'object' &&
      entry.value !== null
    ) {
      return entry.value as Record<string, unknown>;
    }

    return {};
  }

  private async putDocument(
    store: OrbitDatabase,
    document: Record<string, unknown>,
  ): Promise<void> {
    await store.put?.(document);
  }

  private async putKey(key: string, value: unknown): Promise<void> {
    await this.stores.heads.put?.(key, value);
  }
}

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
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
      listenAddresses: [`${relayAddress}/p2p-circuit`],
    });
    const requester = await createNode('requester', networkKey, {
      listenAddresses: [`${relayAddress}/p2p-circuit`],
    });
    const intruder = await createNode('intruder', networkKey, {
      listenAddresses: [`${relayAddress}/p2p-circuit`],
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
    const providerProjection = new OrbitDbProjection(
      providerStores.events,
      providerStores,
    );
    const requesterProjection = new OrbitDbProjection(
      requesterStores.events,
      requesterStores,
    );

    await providerProjection.start();
    await requesterProjection.start();
    await waitForOrbitPeer(providerStores.events);
    await waitForOrbitPeer(requesterStores.events);
    await assertAccessControl(providerStores.events, [
      provider.orbitdb.identity.id,
      requester.orbitdb.identity.id,
    ]);

    const eventEnvelopes = createDomainEvents();
    for (const envelope of eventEnvelopes) {
      await providerStores.events.add?.(envelope);
    }

    await assertQueryViability(requesterStores, requesterProjection);
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
    await assertQueryViability(restartedRequester.stores, restartedRequester.projection);
    await restartedRequester.orbitdb.stop();

    console.info(
      JSON.stringify(
        {
          eventCount: eventEnvelopes.length,
          providerPeerId: getPeerId(provider.helia),
          requesterPeerId: getPeerId(requester.helia),
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
): Promise<ProjectionStores & { events: OrbitDatabase }> {
  const AccessController = orbitdbCore.IPFSAccessController({ write: writers });

  return {
    communities: await openDocuments(
      orbitdbCore,
      orbitdb,
      `${NETWORK_ID}/documents/communities`,
      AccessController,
    ),
    events: await orbitdb.open(`${NETWORK_ID}/events/domain-events`, {
      AccessController,
      type: 'events',
    }),
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
  providerStores: ProjectionStores & { events: OrbitDatabase },
  requesterStores: ProjectionStores & { events: OrbitDatabase },
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

function getAddresses(stores: ProjectionStores & { events: OrbitDatabase }): StoreAddresses {
  return {
    communities: stores.communities.address,
    events: stores.events.address,
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
  projection: OrbitDbProjection;
  stores: ProjectionStores & { events: OrbitDatabase };
}> {
  await node.orbitdb?.stop();
  const orbitdb = await createOrbitDb(orbitdbCore, node);
  const stores = await openStores(orbitdbCore, orbitdb, writers);
  const projection = new OrbitDbProjection(stores.events, stores);
  await projection.start();

  return { orbitdb, projection, stores };
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

function createDomainEvents(): DomainEventEnvelope[] {
  return [
    {
      event: {
        cid: 'cid-identity-hasko-v2',
        identityId: 'identity-hasko',
        type: 'identity.updated',
      },
      eventId: 'event-identity-updated',
    },
    {
      event: {
        cid: 'cid-keychain-hasko-v5',
        identityId: 'identity-hasko',
        type: 'keychain.updated',
      },
      eventId: 'event-keychain-updated',
    },
    {
      event: {
        channelId: 'channel-general',
        communityId: 'community-alpha',
        memberIds: ['identity-hasko', 'identity-maria'],
        type: 'community.created',
      },
      eventId: 'event-community-created',
    },
    {
      event: {
        body: 'Initial encrypted/plain payload reference',
        conversationId: 'group:orbitdb-spike',
        createdAt: 1781020000000,
        messageId: 'message-1',
        type: 'message.created',
      },
      eventId: 'event-message-created',
    },
    {
      event: {
        body: 'Edited payload reference',
        editedAt: 1781020005000,
        messageId: 'message-1',
        type: 'message.edited',
      },
      eventId: 'event-message-edited',
    },
    {
      event: {
        conversationId: 'group:orbitdb-spike',
        identityId: 'identity-maria',
        messageId: 'message-1',
        readAt: 1781020006000,
        type: 'message.read',
      },
      eventId: 'event-message-read',
    },
    {
      event: {
        identityId: 'identity-maria',
        notificationId: 'notification-1',
        scopeId: 'group:orbitdb-spike',
        type: 'notification.created',
      },
      eventId: 'event-notification-created',
    },
    {
      event: {
        communityId: 'community-alpha',
        inviteId: 'invite-1',
        invitedIdentityId: 'identity-maria',
        status: 'pending',
        type: 'community.invite.created',
      },
      eventId: 'event-community-invite-created',
    },
    {
      event: {
        communityId: 'community-alpha',
        requestId: 'join-request-1',
        requesterIdentityId: 'identity-yuki',
        status: 'pending',
        type: 'community.membership_request.created',
      },
      eventId: 'event-community-membership-request-created',
    },
  ];
}

async function assertAccessControl(
  eventStore: OrbitDatabase,
  expectedWriters: string[],
): Promise<void> {
  const writers = eventStore.access?.write || [];

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
      await stores.events.add?.({
        event: {
          cid: 'cid-intruder',
          identityId: 'identity-intruder',
          type: 'identity.updated',
        },
        eventId: 'event-intruder',
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

async function assertQueryViability(
  stores: ProjectionStores,
  projection: OrbitDbProjection,
): Promise<void> {
  await waitFor(async () => {
    const identity = await getDocumentValue(stores.identities, 'identity-hasko');

    return identity?.cid === 'cid-identity-hasko-v2' ? true : undefined;
  }, 'latest identity projection');

  const keychain = await getDocumentValue(stores.keychains, 'identity-hasko');
  if (keychain?.cid !== 'cid-keychain-hasko-v5') {
    throw new Error('Latest keychain projection was not replicated');
  }

  const messages = await stores.messages.query?.(
    (message) => message.conversationId === 'group:orbitdb-spike',
  );
  const [message] = messages || [];
  if (
    messages?.length !== 1 ||
    message.id !== 'message-1' ||
    message.body !== 'Edited payload reference' ||
    message.editedAt !== 1781020005000
  ) {
    throw new Error('Message timeline/edit projection was not viable');
  }

  const readMarker = await stores.heads.get?.(
    'read-marker:group:orbitdb-spike:identity-maria',
  );
  if (!isRecord(readMarker) || readMarker.messageId !== 'message-1') {
    throw new Error('Read marker keyvalue projection was not viable');
  }

  const notifications = await stores.notifications.query?.(
    (notification) => notification.identityId === 'identity-maria',
  );
  if (notifications?.length !== 1) {
    throw new Error('Notification query projection was not viable');
  }

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
  if (inviteRequests?.length !== 1 || joinRequests?.length !== 1) {
    throw new Error('Invite or membership request query was not viable');
  }

  const websocketEvents = projection.getWebsocketEvents();
  for (const event of [
    'identity.updated',
    'keychain.updated',
    'community.created',
    'message.created',
    'message.edited',
    'message.read',
    'notification.created',
    'community.invite.created',
    'community.membership_request.created',
  ]) {
    if (!websocketEvents.includes(event)) {
      throw new Error(`Missing websocket projection for ${event}`);
    }
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
