import 'reflect-metadata';
import 'module-alias/register';

import { PublicIPFSContentFallback } from '@app/contexts/shared/infrastructure/ipfs/fallback/PublicIPFSContentFallback';
import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import libp2pKeyAdapter from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import DomainEvent from '@app/shared/domain/events/DomainEvent';
import Libp2pGossipsubAdapter from '@app/shared/infrastructure/messageBus/libp2p/Libp2pGossipsubMessageBusAdapter';
import Libp2pGossipsubTransport from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubTransport';
import runtime from '@app/shared/infrastructure/pubsub/libp2p/Libp2pGossipsubRuntimeAdapter';
import { PublicRelayAddressFactory } from '@app/shared/infrastructure/network/relay/PublicRelayAddressFactory';
import { PublicRelayConfiguration } from '@app/shared/infrastructure/network/relay/PublicRelayConfiguration';
import { PublicRelayRecordDiscovery } from '@app/shared/infrastructure/network/relay/PublicRelayRecordDiscovery';
import { PublicRelayRecordRegistry } from '@app/shared/infrastructure/network/relay/PublicRelayRecordRegistry';
import { PublicRelayRecordSigner } from '@app/shared/infrastructure/network/relay/PublicRelayRecordSigner';
import { PublicRelayRuntimeAdapter } from '@app/shared/infrastructure/network/relay/PublicRelayRuntimeAdapter';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import getPort from 'get-port';
import path from 'path';

type ChildRuntime = {
  name: string;
  process: ChildProcessWithoutNullStreams;
  stderr: string[];
  stdout: string[];
};

const ROOT = path.resolve(__dirname, '../../..');
const NODE_COMMAND = process.execPath;
const NODE_ARGS = [
  '-r',
  'ts-node/register',
  '-r',
  'tsconfig-paths/register',
  __filename,
];
const NETWORK_ID = '550e8400-e29b-41d4-a716-446655440123';
const NETWORK_NAME = 'relay-private-fallback-e2e';
const NETWORK_KEY =
  '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGAjx38RTkT7ZsPCcTRgrTAWjBdk5+Pq+/a5h2dPLsw3\n-----END PRIVATE KEY-----\n';
const CONTENT_CID = new IPFSId('bafy-pigeon-relay-private-fallback');
const CONTENT_BYTES = Buffer.from('private-ipfs-content-over-public-relay');
const EVENT_TYPE = 'tests.v1.public_relay_private_fallback.was_checked';
const WAIT_TIMEOUT_MS = 60000;

class PublicRelayPrivateFallbackWasCheckedEvent extends DomainEvent {
  public static readonly EVENT_NAME = EVENT_TYPE;

  public eventName(): string {
    return PublicRelayPrivateFallbackWasCheckedEvent.EVENT_NAME;
  }
}

class InMemoryIPFSConnection implements IPFSConnection {
  private readonly pubSubHandlers = new Map<
    string,
    Array<(payload: string) => Promise<void>>
  >();
  private readonly records = new Map<string, string>();
  private readonly bytes = new Map<string, Buffer>();
  private readonly json = new Map<string, unknown>();

  public constructor(
    private readonly peerId: string,
    initialBytes: Map<string, Buffer> = new Map(),
  ) {
    initialBytes.forEach((value, key) => this.bytes.set(key, value));
  }

  public stat(cid: IPFSId): Promise<void> {
    if (!this.bytes.has(cid.valueOf()) && !this.json.has(cid.valueOf())) {
      return Promise.reject(new Error(`CID ${cid.valueOf()} not found.`));
    }

    return Promise.resolve();
  }

  public addBytes(bytes: Uint8Array): Promise<IPFSId> {
    this.bytes.set(CONTENT_CID.valueOf(), Buffer.from(bytes));

    return Promise.resolve(CONTENT_CID);
  }

  public getBytes(cid: IPFSId): Promise<Buffer> {
    const value = this.bytes.get(cid.valueOf());

    if (!value) {
      return Promise.reject(new Error(`CID ${cid.valueOf()} not found.`));
    }

    return Promise.resolve(value);
  }

  public addJSON(data: unknown): Promise<IPFSId> {
    this.json.set(CONTENT_CID.valueOf(), data);

    return Promise.resolve(CONTENT_CID);
  }

  public removeJSON(cid: IPFSId): Promise<void> {
    this.json.delete(cid.valueOf());

    return Promise.resolve();
  }

  public getJSON<T>(cid: IPFSId): Promise<T> {
    if (!this.json.has(cid.valueOf())) {
      return Promise.reject(new Error(`CID ${cid.valueOf()} not found.`));
    }

    return Promise.resolve(this.json.get(cid.valueOf()) as T);
  }

  public putRecord(key: string, value: string): Promise<void> {
    this.records.set(key, value);

    return Promise.resolve();
  }

  public getRecord(key: string): Promise<string | undefined> {
    return Promise.resolve(this.records.get(key));
  }

  public async publishPubSub(topic: string, payload: string): Promise<void> {
    await Promise.all(
      (this.pubSubHandlers.get(topic) || []).map((handler) =>
        handler(payload),
      ),
    );
  }

  public subscribePubSub(
    topic: string,
    handler: (payload: string) => Promise<void>,
  ): Promise<void> {
    this.pubSubHandlers.set(topic, [
      ...(this.pubSubHandlers.get(topic) || []),
      handler,
    ]);

    return Promise.resolve();
  }

  public blockPeer(): Promise<void> {
    return Promise.resolve();
  }

  public getPeers(): string[] {
    return [];
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }
}

class SingleNetworkRegistry implements Partial<IPFSNetworkRegistry> {
  private readonly listeners: Array<(network: IPFSNetwork) => void> = [];

  public constructor(private readonly network: IPFSNetwork) {}

  public getAll(): IPFSNetwork[] {
    return [this.network];
  }

  public onNetworkRegistered(listener: (network: IPFSNetwork) => void): void {
    this.listeners.push(listener);
  }
}

async function main(): Promise<void> {
  const [, , mode] = process.argv;

  if (mode === 'relay') {
    await runRelay();

    return;
  }

  if (mode === 'peer') {
    await runPeer();

    return;
  }

  await runParent();
}

async function runParent(): Promise<void> {
  const relayPort = await getPort();
  const relay = spawnChild('relay', {
    PIGEON_RELAY_PORT: String(relayPort),
  });

  try {
    const relayReady = await waitForChildEvent<{
      multiaddr: string;
      type: 'relay-ready';
    }>(relay, 'relay-ready');
    const peerA = spawnChild('peer-a', {
      E2E_BOOTSTRAP_RELAY_MULTIADDR: relayReady.multiaddr,
      E2E_HAS_CONTENT: 'true',
    });
    const peerB = spawnChild('peer-b', {
      E2E_BOOTSTRAP_RELAY_MULTIADDR: relayReady.multiaddr,
    });

    try {
      await Promise.all([
        waitForChildEvent(peerA, 'peer-ready'),
        waitForChildEvent(peerB, 'peer-ready'),
      ]);
      await Promise.all([
        waitForChildEvent(peerA, 'relay-record-discovered'),
        waitForChildEvent(peerB, 'relay-record-discovered'),
      ]);
      await Promise.all([
        waitForChildEvent(peerA, 'peer-connected'),
        waitForChildEvent(peerB, 'peer-connected'),
      ]);

      sendCommand(peerA, { command: 'publish-event' });
      await waitForChildEvent(peerB, 'event-received');

      sendCommand(peerB, { cid: CONTENT_CID.valueOf(), command: 'fetch-bytes' });
      await waitForChildEvent(peerB, 'content-fetched');

      console.info(
        JSON.stringify(
          {
            contentCid: CONTENT_CID.valueOf(),
            relayMultiaddr: relayReady.multiaddr,
            result: 'PASS',
          },
          null,
          2,
        ),
      );
    } finally {
      await Promise.allSettled([stopChild(peerA), stopChild(peerB)]);
    }
  } finally {
    await stopChild(relay);
  }
}

async function runRelay(): Promise<void> {
  const relayPort = Number(process.env.PIGEON_RELAY_PORT);
  const configuration = new PublicRelayConfiguration({
    bootstrapRelayMultiaddrs: [],
    libp2pPort: relayPort + 1,
    publicHost: '127.0.0.1',
    relayAutoEnabled: false,
    relayDiscoveryEnabled: true,
    relayEnabled: true,
    relayPort,
    relayRecordTtlSeconds: 300,
  });
  const addressFactory = new PublicRelayAddressFactory(configuration);
  const privateKey = await libp2pKeyAdapter.generateEd25519KeyPair();
  const node = await new PublicRelayRuntimeAdapter(
    configuration,
    addressFactory,
  ).createNode(privateKey);
  const peerId = node.peerId?.toString();
  const multiaddr = peerId
    ? addressFactory.relayAdvertiseAddress(peerId)
    : undefined;

  if (!multiaddr) {
    throw new Error('Relay multiaddr was not created.');
  }

  const record = await new PublicRelayRecordSigner()
    .sign(
      {
        expiresAt: Date.now() + 300000,
        issuedAt: Date.now(),
        multiaddrs: [multiaddr],
        peerId: peerId || '',
        role: 'relay',
        version: 1,
      },
      privateKey,
    )
    .then((signedRecord) => signedRecord.toPrimitives());
  const discovery = new PublicRelayRecordDiscovery();

  await discovery.publish(node, record);
  const publishInterval = setInterval(() => {
    void discovery.publish(node, record);
  }, 2000);
  publishInterval.unref?.();

  emit({ multiaddr, type: 'relay-ready' });
  process.on('SIGTERM', () => {
    node.stop?.().finally(() => process.exit(0));
  });
}

async function runPeer(): Promise<void> {
  process.env.PIGEON_BOOTSTRAP_RELAY_MULTIADDRS =
    process.env.E2E_BOOTSTRAP_RELAY_MULTIADDR || '';

  const hasContent = process.env.E2E_HAS_CONTENT === 'true';
  const initialBytes = hasContent
    ? new Map([[CONTENT_CID.valueOf(), CONTENT_BYTES]])
    : new Map<string, Buffer>();
  const network = new IPFSNetwork(
    IPFSNetworkConfig.fromPrimitives({
      id: NETWORK_ID,
      key: NETWORK_KEY,
      name: NETWORK_NAME,
    }),
    new InMemoryIPFSConnection(randomUUID(), initialBytes),
  );
  const networkRegistry = new SingleNetworkRegistry(network);
  const transport = new Libp2pGossipsubTransport();
  const messageBus = new Libp2pGossipsubAdapter(
    transport,
    networkRegistry as unknown as IPFSNetworkRegistry,
  );
  const fallback = new PublicIPFSContentFallback();

  await fallback.serve([network]);
  await messageBus.consume(
    'relay-private-fallback-e2e',
    EVENT_TYPE,
    PublicRelayPrivateFallbackWasCheckedEvent,
    'events',
    async () => {
      emit({ type: 'event-received' });
    },
  );

  emit({ type: 'peer-ready' });
  void waitForPublicPeerConnection();
  process.stdin.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      handlePeerCommand(JSON.parse(line), messageBus, fallback, network).catch(
        (error: unknown) => {
          emit({ error: String(error), type: 'peer-error' });
        },
      );
    }
  });
}

async function waitForPublicPeerConnection(): Promise<void> {
  const node = await runtime.createNode();
  const relayRecordRegistry = new PublicRelayRecordRegistry();
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let relayRecordDiscovered = false;
  let peerConnected = false;

  while (Date.now() < deadline) {
    if (!relayRecordDiscovered && relayRecordRegistry.all().length > 0) {
      relayRecordDiscovered = true;
      emit({ type: 'relay-record-discovered' });
    }

    if (!peerConnected && (node.getPeers?.() || []).length >= 2) {
      peerConnected = true;
      emit({ type: 'peer-connected' });
    }

    if (relayRecordDiscovered && peerConnected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  emit({
    peerCount: (node.getPeers?.() || []).length,
    type: 'peer-connection-timeout',
  });
}

async function handlePeerCommand(
  command: { cid?: string; command: string },
  messageBus: Libp2pGossipsubAdapter,
  fallback: PublicIPFSContentFallback,
  network: IPFSNetwork,
): Promise<void> {
  if (command.command === 'publish-event') {
    await messageBus.publish([
      new PublicRelayPrivateFallbackWasCheckedEvent('relay-e2e', {
        networkId: NETWORK_ID,
      }),
    ]);

    return;
  }

  if (command.command === 'fetch-bytes' && command.cid) {
    const bytes = await fallback.getBytes([network], new IPFSId(command.cid));

    if (!bytes.equals(CONTENT_BYTES)) {
      throw new Error('Fetched bytes did not match expected content.');
    }

    emit({ type: 'content-fetched' });
  }
}

function spawnChild(name: string, environment: NodeJS.ProcessEnv): ChildRuntime {
  const child = spawn(NODE_COMMAND, [...NODE_ARGS, name === 'relay' ? 'relay' : 'peer'], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...environment,
      NODE_ENV: 'test',
    },
  });
  const runtime: ChildRuntime = {
    name,
    process: child,
    stderr: [],
    stdout: [],
  };

  child.stdout.on('data', (data: Buffer) => {
    const text = data.toString();

    runtime.stdout.push(text);
    process.stdout.write(`[${name}] ${text}`);
  });
  child.stderr.on('data', (data: Buffer) => {
    const text = data.toString();

    runtime.stderr.push(text);
    process.stderr.write(`[${name}] ${text}`);
  });

  return runtime;
}

function sendCommand(
  child: ChildRuntime,
  command: Record<string, unknown>,
): void {
  child.process.stdin.write(`${JSON.stringify(command)}\n`);
}

async function stopChild(child: ChildRuntime): Promise<void> {
  if (child.process.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.process.kill('SIGKILL');
      resolve();
    }, 5000);

    child.process.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.process.kill('SIGTERM');
  });
}

function emit(payload: Record<string, unknown>): void {
  console.info(`E2E_EVENT ${JSON.stringify(payload)}`);
}

async function waitForChildEvent<TEvent extends { type: string }>(
  child: ChildRuntime,
  type: string,
): Promise<TEvent> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    for (const output of child.stdout) {
      for (const line of output.split('\n')) {
        if (!line.startsWith('E2E_EVENT ')) {
          continue;
        }

        const event = JSON.parse(line.slice('E2E_EVENT '.length)) as TEvent;

        if (event.type === type) {
          return event;
        }
      }
    }

    if (child.process.exitCode !== null) {
      throw new Error(
        `${child.name} exited before ${type}.\nSTDOUT:\n${child.stdout.join(
          '',
        )}\nSTDERR:\n${child.stderr.join('')}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for ${type} from ${child.name}.\nSTDOUT:\n${child.stdout.join(
      '',
    )}\nSTDERR:\n${child.stderr.join('')}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
