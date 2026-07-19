import 'reflect-metadata';
import 'module-alias/register';

import { heliaRuntimeAdapter } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { spawn } from 'child_process';
import { generateKeyPairSync, randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

import {
  RealTransportInstanceEvent,
  RealTransportInstanceProcess,
} from './RealTransportInstanceProcess';

const ROOT = path.resolve(__dirname, '../../..');
const RUN_ID = randomUUID();
const TMP_ROOT = path.join(
  ROOT,
  '.tmp',
  `two-private-relay-mesh-e2e-${RUN_ID}`,
);
const INSTANCE_SCRIPT = path.join(
  __dirname,
  'private-relay-discovery-instance.ts',
);
const TSX_BIN = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const NETWORK_ID = randomUUID();
const NETWORK_NAME = `private-relay-mesh-e2e-${RUN_ID}`;
const WAIT_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_TIMEOUT_MS || 120000,
);
const FALSE_POSITIVE_GUARD_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_FALSE_POSITIVE_GUARD_MS || 1500,
);

type PublicBootstrap = Awaited<
  ReturnType<typeof heliaRuntimeAdapter.createLibp2p>
>;

type RelayReadyEvent = RealTransportInstanceEvent & {
  advertisedRelayAddress: string;
  peerId: string;
};

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
  const networkKey = generateNetworkKey();
  let bootstraps: PublicBootstrap[] = [];
  let completed = false;
  let relayA: RealTransportInstanceProcess | undefined;
  let relayB: RealTransportInstanceProcess | undefined;

  try {
    bootstraps = await Promise.all(
      Array.from({ length: 4 }, () => createPublicBootstrap()),
    );
    const bootstrapAddress = (
      await Promise.all(bootstraps.map(waitForPublicMultiaddr))
    ).join(',');

    relayA = spawnRelay('relay-a', networkKey, bootstrapAddress);
    relayB = spawnRelay('relay-b', networkKey, bootstrapAddress);
    const [relayAReady, relayBReady] = (await Promise.all([
      relayA.waitFor('relay-ready', (event) => event.type === 'relay-ready'),
      relayB.waitFor('relay-ready', (event) => event.type === 'relay-ready'),
    ])) as [RelayReadyEvent, RelayReadyEvent];

    assertDistinctRelays(relayAReady, relayBReady);
    await assertNoPreDiscoveryPubSub(relayA, relayB);
    await connectRelayMesh(relayA, relayAReady, relayB, relayBReady);
    await assertPostDiscoveryPubSub(relayA, relayB);
    await assertOrbitDBLateJoinReplication(relayA, relayB);

    console.info(
      JSON.stringify(
        {
          networkId: NETWORK_ID,
          relayAPeerId: relayAReady.peerId,
          relayBPeerId: relayBReady.peerId,
          result: 'PASS',
          transportDsn: 'private-relay-mesh-public-ipfs-discovery://',
        },
        null,
        2,
      ),
    );
    completed = true;
  } finally {
    if (!completed) {
      process.stderr.write(
        `relay-a diagnostics:\n${relayA?.diagnostics() || ''}\nrelay-b diagnostics:\n${relayB?.diagnostics() || ''}\n`,
      );
    }

    await Promise.allSettled([relayA?.stop(), relayB?.stop()]);
    await Promise.race([
      Promise.allSettled(bootstraps.map((bootstrap) => bootstrap.stop())),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    await fs.remove(TMP_ROOT);
  }
}

function assertDistinctRelays(
  relayA: RelayReadyEvent,
  relayB: RelayReadyEvent,
): void {
  if (relayA.peerId === relayB.peerId) {
    throw new Error('False-positive guard failed: relay peer IDs are equal.');
  }

  if (relayA.advertisedRelayAddress === relayB.advertisedRelayAddress) {
    throw new Error(
      'False-positive guard failed: advertised relay addresses are equal.',
    );
  }
}

async function connectRelayMesh(
  relayA: RealTransportInstanceProcess,
  relayAReady: RelayReadyEvent,
  relayB: RealTransportInstanceProcess,
  relayBReady: RelayReadyEvent,
): Promise<void> {
  const [dialer, dialerReady, receiver, receiverReady] =
    relayAReady.peerId < relayBReady.peerId
      ? [relayA, relayAReady, relayB, relayBReady]
      : [relayB, relayBReady, relayA, relayAReady];

  receiver.send({
    remotePeerId: dialerReady.peerId,
    type: 'start-relay-mesh',
  });
  await receiver.waitFor(
    'relay mesh discovery startup',
    (event) =>
      event.type === 'relay-mesh-started' &&
      event.peerId === dialerReady.peerId,
  );
  dialer.send({
    remotePeerId: receiverReady.peerId,
    type: 'start-relay-mesh',
  });

  await Promise.all([
    dialer.waitFor(
      'direct relay mesh connection',
      (event) =>
        event.type === 'relay-mesh-connected' &&
        event.peerId === receiverReady.peerId,
    ),
    receiver.waitFor(
      'incoming relay mesh connection',
      (event) =>
        event.type === 'relay-mesh-connected' &&
        event.peerId === dialerReady.peerId,
    ),
  ]);
}

async function assertNoPreDiscoveryPubSub(
  publisher: RealTransportInstanceProcess,
  subscriber: RealTransportInstanceProcess,
): Promise<void> {
  const topic = `pigeon-swarm.e2e.${NETWORK_ID}.relay-mesh.pre.${randomUUID()}`;
  const payload = `payload-${randomUUID()}`;

  subscriber.send({
    guardMs: FALSE_POSITIVE_GUARD_MS,
    payload,
    topic,
    type: 'subscribe-pre-pubsub',
  });
  await subscriber.waitFor(
    'pre-discovery pubsub subscription',
    (event) => event.type === 'pre-pubsub-subscribed' && event.topic === topic,
  );
  publisher.send({ payload, topic, type: 'publish-pubsub' });
  await subscriber.waitFor(
    'pre-discovery pubsub false-positive guard',
    (event) => event.type === 'pre-pubsub-ok' && event.topic === topic,
  );
}

async function assertPostDiscoveryPubSub(
  publisher: RealTransportInstanceProcess,
  subscriber: RealTransportInstanceProcess,
): Promise<void> {
  const topic = `pigeon-swarm.e2e.${NETWORK_ID}.relay-mesh.post.${randomUUID()}`;
  const payload = `payload-${randomUUID()}`;

  subscriber.send({ payload, topic, type: 'subscribe-pubsub' });
  await subscriber.waitFor(
    'post-discovery pubsub subscription',
    (event) => event.type === 'pubsub-subscribed' && event.topic === topic,
  );
  publisher.send({ payload, topic, type: 'publish-pubsub' });
  await subscriber.waitFor(
    'post-discovery pubsub delivery',
    (event) =>
      event.type === 'pubsub-received' &&
      event.topic === topic &&
      event.payload === payload,
  );
}

async function assertOrbitDBLateJoinReplication(
  publisher: RealTransportInstanceProcess,
  subscriber: RealTransportInstanceProcess,
): Promise<void> {
  const address = `${NETWORK_ID}/documents/e2e-relay-mesh-${RUN_ID}`;
  const document = {
    id: `relay-mesh-proof-${randomUUID()}`,
    replicated: true,
    runId: RUN_ID,
  };

  publisher.send({ address, type: 'open-orbit' });
  await publisher.waitFor(
    'publisher OrbitDB open',
    (event) => event.type === 'orbit-open' && event.address === address,
  );
  publisher.send({ document, type: 'write-orbit' });
  await publisher.waitFor(
    'publisher OrbitDB write',
    (event) => event.type === 'orbit-written',
  );

  subscriber.send({
    address,
    expectedDocumentId: document.id,
    type: 'open-orbit',
  });
  await subscriber.waitFor(
    'subscriber OrbitDB open',
    (event) => event.type === 'orbit-open' && event.address === address,
  );
  await subscriber.waitFor(
    'relay mesh OrbitDB replication',
    (event) =>
      event.type === 'orbit-replicated' &&
      event.documentId === document.id &&
      event.address === address,
  );
}

function spawnRelay(
  name: string,
  networkKey: string,
  bootstrapAddress: string,
): RealTransportInstanceProcess {
  const child = spawn(
    TSX_BIN,
    ['-r', 'tsconfig-paths/register', INSTANCE_SCRIPT],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PRIVATE_RELAY_DISCOVERY_E2E_AUTO_START_RELAY_DISCOVERY: 'false',
        PRIVATE_RELAY_DISCOVERY_E2E_INSTANCE_ROLE: 'relay',
        PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_ID: NETWORK_ID,
        PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_KEY: networkKey,
        PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_NAME: NETWORK_NAME,
        PRIVATE_RELAY_DISCOVERY_E2E_RUN_ID: RUN_ID,
        PRIVATE_RELAY_DISCOVERY_E2E_STORAGE_ROOT: path.join(TMP_ROOT, name),
        PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS: '15000',
        PIGEON_PUBLIC_BOOTSTRAP_ENABLED: 'true',
        PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS: bootstrapAddress,
        PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS: '2000',
        PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS: '10000',
        PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS: '2000',
        PIGEON_RELAY_RECORD_TTL_MS: '600000',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  return new RealTransportInstanceProcess(name, child, WAIT_TIMEOUT_MS);
}

async function createPublicBootstrap(): Promise<PublicBootstrap> {
  const config = await heliaRuntimeAdapter.getLibp2pDefaults({
    distributedHashTableServerEnabled: true,
    localAddressRoutingEnabled: true,
    localPeerDiscoveryEnabled: false,
    publicBootstrap: false,
  });

  config.addresses = {
    ...(config.addresses || {}),
    listen: ['/ip4/127.0.0.1/tcp/0'],
  };
  config.peerDiscovery = [];

  return heliaRuntimeAdapter.createLibp2p(config);
}

async function waitForPublicMultiaddr(
  connection: PublicBootstrap,
): Promise<string> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const address = connection
      .getMultiaddrs()
      .map((candidate) => candidate.toString())
      .find(
        (candidate) =>
          candidate.includes('/ip4/127.0.0.1/') &&
          candidate.includes('/tcp/') &&
          !candidate.includes('/p2p-circuit'),
      );

    if (address) {
      return address;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for the public DHT bootstrap multiaddr.');
}

function generateNetworkKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');

  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
