import 'reflect-metadata';
import 'module-alias/register';

import { heliaRuntimeAdapter } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { spawn } from 'child_process';
import { isDeepStrictEqual } from 'util';
import { CallSignalSentEvent } from '@app/contexts/calls/domain/events/CallSignalSentEvent';
import PubSubTopicResolver from '@app/shared/infrastructure/messageBus/libp2p/PubSubTopicResolver';
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
  let report: Record<string, unknown> | undefined;
  let relayA: RealTransportInstanceProcess | undefined;
  let relayB: RealTransportInstanceProcess | undefined;
  let relayC: RealTransportInstanceProcess | undefined;

  try {
    bootstraps = await Promise.all(
      Array.from({ length: 4 }, () => createPublicBootstrap()),
    );
    const bootstrapAddress = (
      await Promise.all(bootstraps.map(waitForPublicMultiaddr))
    ).join(',');

    relayA = spawnRelay('relay-a', networkKey, bootstrapAddress);
    await relayA.waitFor(
      'first relay ready',
      (event) => event.type === 'relay-ready',
    );
    relayB = spawnRelay('relay-b', networkKey, bootstrapAddress, true);
    const [relayAReady, relayBReady] = (await Promise.all([
      relayA.waitFor('relay-ready', (event) => event.type === 'relay-ready'),
      relayB.waitFor('relay-ready', (event) => event.type === 'relay-ready'),
    ])) as [RelayReadyEvent, RelayReadyEvent];

    assertDistinctRelays(relayAReady, relayBReady);
    await assertNoPreDiscoveryPubSub(relayA, relayB);
    await connectRelayMesh(relayA, relayAReady, relayB, relayBReady, () =>
      setPublicNetwork(relayB!, true),
    );
    await assertPostDiscoveryPubSub(relayA, relayB);
    await assertOrbitDBLateJoinReplication(relayA, relayB);

    relayC = spawnRelay('relay-c', networkKey, bootstrapAddress);
    const relayCReady = (await relayC.waitFor(
      'third relay ready',
      (event) => event.type === 'relay-ready',
    )) as RelayReadyEvent;
    assertDistinctRelays(relayAReady, relayCReady);
    assertDistinctRelays(relayBReady, relayCReady);
    const relays = [relayA, relayB, relayC];
    const peerIds = [
      relayAReady.peerId,
      relayBReady.peerId,
      relayCReady.peerId,
    ];
    await assertFullMesh(relays, peerIds, 2);
    await assertPostDiscoveryPubSub(relayA, relayC);
    await assertPostDiscoveryPubSub(relayC, relayB);

    for (let cycle = 0; cycle < 2; cycle += 1) {
      const requestId = randomUUID();
      const startedAt = Date.now();
      relayC.send({ type: 'drop-private-connections', requestId });
      await relayC.waitFor(
        'private connections dropped',
        (event) =>
          event.type === 'private-connections-dropped' &&
          event.requestId === requestId,
      );
      await assertFullMesh(relays, peerIds);
      await assertPostDiscoveryPubSub(relayC, relayA);
      await assertOrbitDBLateJoinReplication(relayA, relayC);
      console.info(
        JSON.stringify({
          cycle,
          recoveryMs: Date.now() - startedAt,
          phase: 'three-relay-recovery',
        }),
      );
    }

    await Promise.all(relays.map((relay) => setPublicNetwork(relay, false)));
    const isolatedIndex = peerIds.indexOf([...peerIds].sort()[0]);
    const isolatedRelay = relays[isolatedIndex];
    await setPrivateDials(isolatedRelay, false);
    const partitionId = randomUUID();
    isolatedRelay.send({
      type: 'drop-private-connections',
      requestId: partitionId,
    });
    await isolatedRelay.waitFor(
      'partition applied',
      (event) =>
        event.type === 'private-connections-dropped' &&
        event.requestId === partitionId,
    );
    const partitionStartedAt = Date.now();
    await assertFullMesh(relays, peerIds);
    await Promise.all(relays.map((relay) => setPublicNetwork(relay, false)));
    await assertPostDiscoveryPubSub(relayA, relayC);
    await assertOrbitDBLateJoinReplication(relayB, relayC);
    if (Date.now() - partitionStartedAt > 90_000) {
      throw new Error(
        'Cached mesh and traffic recovery exceeded the 90 second local fault budget.',
      );
    }
    console.info(
      JSON.stringify({
        phase: 'public-network-outage',
        recoveryMs: Date.now() - partitionStartedAt,
      }),
    );
    const dialState = await setPrivateDials(isolatedRelay, true);
    if (Number(dialState.rejectedPrivateDials) === 0) {
      throw new Error(
        'The selected initiator did not attempt an outbound dial during the fault.',
      );
    }
    await Promise.all(relays.map((relay) => setPublicNetwork(relay, true)));

    console.info(JSON.stringify({ phase: 'public-network-restored' }));
    await Promise.all(relays.map((relay) => setPrivateDials(relay, true)));
    await relayC.stop();
    console.info(JSON.stringify({ phase: 'relay-process-stopped' }));
    relayC = spawnRelay('relay-c', networkKey, bootstrapAddress);
    const restartedReady = await relayC.waitFor(
      'restarted relay ready',
      (event) => event.type === 'relay-ready',
    );
    if (
      restartedReady.peerId !== relayCReady.peerId ||
      restartedReady.pid === relayCReady.pid
    ) {
      throw new Error(
        'Restart must retain the peer identity in a new process.',
      );
    }
    console.info(JSON.stringify({ phase: 'relay-process-ready' }));
    const restartStartedAt = Date.now();
    await assertFullMesh([relayA, relayB, relayC], peerIds, 2);
    await assertPostDiscoveryPubSub(relayC, relayA);
    await assertOrbitDBLateJoinReplication(relayB, relayC);
    await Promise.all(
      [relayA, relayB, relayC].map((relay) => setPrivateDials(relay, true)),
    );
    console.info(
      JSON.stringify({
        phase: 'process-restart',
        recoveryMs: Date.now() - restartStartedAt,
      }),
    );

    report = {
      networkId: NETWORK_ID,
      relayAPeerId: relayAReady.peerId,
      relayBPeerId: relayBReady.peerId,
      relayCPeerId: relayCReady.peerId,
      scope:
        'local TCP relay discovery, encrypted call signalling and OrbitDB; no NAT or WebRTC media proof',
      result: 'PASS',
      transportDsn: 'private-relay-mesh-public-ipfs-discovery://',
    };
    completed = true;
  } finally {
    if (!completed) {
      process.stderr.write(
        `relay-a diagnostics:\n${relayA?.diagnostics() || ''}\nrelay-b diagnostics:\n${relayB?.diagnostics() || ''}\nrelay-c diagnostics:\n${relayC?.diagnostics() || ''}\n`,
      );
    }

    const relayShutdowns = await Promise.allSettled([
      relayA?.stop(),
      relayB?.stop(),
      relayC?.stop(),
    ]);
    let stopTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(bootstraps.map((bootstrap) => bootstrap.stop())),
        new Promise<never>((_, reject) => {
          stopTimeout = setTimeout(
            () =>
              reject(
                new Error('Public bootstrap shutdown exceeded 15 seconds.'),
              ),
            15_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(stopTimeout);
      await fs.remove(TMP_ROOT);
    }
    const failedShutdown = relayShutdowns.find(
      (result) => result.status === 'rejected',
    );
    if (failedShutdown?.status === 'rejected') {
      throw failedShutdown.reason;
    }
  }
  console.info(JSON.stringify(report, null, 2));
}

async function setPrivateDials(
  relay: RealTransportInstanceProcess,
  enabled: boolean,
): Promise<RealTransportInstanceEvent> {
  const requestId = randomUUID();
  relay.send({ type: 'set-private-dials', enabled, requestId });
  const state = await relay.waitFor(
    'private dial state',
    (event) =>
      event.type === 'private-dial-state' && event.requestId === requestId,
  );
  if (state.concurrentDuplicateDials !== 0) {
    throw new Error('Overlapping private relay dials detected.');
  }
  return state;
}

async function setPublicNetwork(
  relay: RealTransportInstanceProcess,
  enabled: boolean,
): Promise<void> {
  const requestId = randomUUID();
  relay.send({ type: 'set-public-network', enabled, requestId });
  await relay.waitFor(
    'public network state',
    (event) =>
      event.type === 'public-network-state' &&
      event.requestId === requestId &&
      event.enabled === enabled &&
      (enabled ? Number(event.peerCount) > 0 : event.peerCount === 0),
  );
}

async function assertFullMesh(
  relays: RealTransportInstanceProcess[],
  peerIds: string[],
  startDiscoveryIndex?: number,
): Promise<void> {
  await Promise.all(
    relays.map(async (relay, index) => {
      const requestId = randomUUID();
      relay.send({
        type: 'wait-relay-peers',
        requestId,
        peerIds: peerIds.filter((_, peerIndex) => peerIndex !== index),
        startDiscovery: index === startDiscoveryIndex,
      });
      await relay.waitFor(
        'complete three-relay mesh',
        (event) =>
          event.type === 'relay-peers-connected' &&
          event.requestId === requestId,
      );
    }),
  );
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
  restorePublicNetwork: () => Promise<void>,
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

  await dialer.waitFor(
    'dialer discovery started',
    (event) => event.type === 'relay-mesh-started',
  );
  await relayB.waitFor(
    'initial discovery completed without public connectivity',
    (event) =>
      event.type === 'discovery-pass-completed' &&
      event.publicPeerCount === 0 &&
      event.privatePeerCount === 0,
  );
  await restorePublicNetwork();

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
  const topic = new PubSubTopicResolver().fromRoutingKeyForNetwork(
    CallSignalSentEvent.EVENT_NAME,
    NETWORK_ID,
  );
  const now = Date.now();
  const callId = randomUUID();
  const payload = new CallSignalSentEvent(callId, {
    attempt: 1,
    callId,
    expiresAt: now + WAIT_TIMEOUT_MS,
    networkId: NETWORK_ID,
    ownerNodeId: randomUUID(),
    participantIds: ['sender', 'recipient'],
    payload: { candidate: `candidate:${randomUUID()}` },
    recipientIdentityId: 'recipient',
    senderIdentityId: 'sender',
    sentAt: now,
    signalId: randomUUID(),
    signalType: 'ice-candidate',
  }).decode();
  const subscriberReady = (await subscriber.waitFor(
    'subscriber relay identity',
    (event) => event.type === 'relay-ready',
  )) as RelayReadyEvent;

  subscriber.send({
    payload,
    topic,
    encrypted: true,
    type: 'subscribe-pubsub',
  });
  await subscriber.waitFor(
    'post-discovery pubsub subscription',
    (event) =>
      event.type === 'pubsub-subscribed' &&
      event.topic === topic &&
      event.payload === payload,
  );
  publisher.send({
    payload,
    topic,
    subscriberPeerId: subscriberReady.peerId,
    encrypted: true,
    type: 'publish-pubsub',
  });
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
  const address = `${NETWORK_ID}/documents/e2e-relay-mesh-${randomUUID()}`;
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
    (event) =>
      event.type === 'orbit-written' &&
      (event.document as { id?: string } | undefined)?.id === document.id,
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
      event.address === address &&
      isDeepStrictEqual(event.document, document),
  );
}

function spawnRelay(
  name: string,
  networkKey: string,
  bootstrapAddress: string,
  delayPublicNetwork = false,
): RealTransportInstanceProcess {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '-r', 'tsconfig-paths/register', INSTANCE_SCRIPT],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PRIVATE_RELAY_DISCOVERY_E2E_AUTO_START_RELAY_DISCOVERY: 'false',
        PRIVATE_RELAY_DISCOVERY_E2E_DELAY_PUBLIC_NETWORK:
          String(delayPublicNetwork),
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
        PIGEON_RELAY_RECORD_CONNECTED_DISCOVERY_INTERVAL_MS: '4000',
        PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS: '1000',
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

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
