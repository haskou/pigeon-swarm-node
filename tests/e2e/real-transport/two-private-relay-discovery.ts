import 'reflect-metadata';
import 'module-alias/register';

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { generateKeyPairSync, randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';

const ROOT = path.resolve(__dirname, '../../..');
const RUN_ID = randomUUID();
const TMP_ROOT = path.join(
  ROOT,
  '.tmp',
  `two-private-relay-discovery-e2e-${RUN_ID}`,
);
const INSTANCE_SCRIPT = path.join(
  __dirname,
  'private-relay-discovery-instance.ts',
);
const TSX_BIN = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const NETWORK_ID = randomUUID();
const NETWORK_NAME = `private-relay-discovery-e2e-${RUN_ID}`;
const WAIT_TIMEOUT_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_TIMEOUT_MS || 120000,
);
const FALSE_POSITIVE_GUARD_MS = Number(
  process.env.PRIVATE_RELAY_DISCOVERY_E2E_FALSE_POSITIVE_GUARD_MS || 1500,
);

type InstanceRole = 'leaf' | 'relay';

type InstanceEvent = {
  type: string;
  [key: string]: unknown;
};

type RelayReadyEvent = InstanceEvent & {
  advertisedRelayAddress: string;
  cid: string;
  peerId: string;
  pid: number;
  sha256: string;
};

class E2EInstanceProcess {
  private readonly events: InstanceEvent[] = [];
  private readonly stderrLines: string[] = [];
  private readonly waiters: Array<{
    label: string;
    predicate: (event: InstanceEvent) => boolean;
    reject(error: Error): void;
    resolve(event: InstanceEvent): void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  private exited:
    | {
        code: number | null;
        signal: NodeJS.Signals | null;
      }
    | undefined;

  public constructor(
    private readonly role: InstanceRole,
    private readonly child: ChildProcessWithoutNullStreams,
  ) {
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      this.handleStdoutLine(line);
    });
    readline.createInterface({ input: child.stderr }).on('line', (line) => {
      this.stderrLines.push(line);
      this.stderrLines.splice(0, Math.max(0, this.stderrLines.length - 80));
    });
    child.once('exit', (code, signal) => {
      this.exited = { code, signal };
      this.rejectWaiters(
        new Error(
          `${this.role} exited before expected event: code=${code} signal=${signal} stderr="${this.stderrTail()}"`,
        ),
      );
    });
  }

  private handleStdoutLine(line: string): void {
    let event: InstanceEvent;

    try {
      event = JSON.parse(line) as InstanceEvent;
    } catch {
      this.stderrLines.push(`non-json stdout: ${line}`);

      return;
    }

    this.events.push(event);
    this.resolveMatchingWaiters(event);
  }

  private resolveMatchingWaiters(event: InstanceEvent): void {
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(event)) {
        continue;
      }

      clearTimeout(waiter.timeout);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(event);
    }
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of [...this.waiters]) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }

    this.waiters.splice(0);
  }

  private stderrTail(): string {
    return this.stderrLines.slice(-20).join('\n');
  }

  public waitFor(
    label: string,
    predicate: (event: InstanceEvent) => boolean,
    timeoutMs: number = WAIT_TIMEOUT_MS,
  ): Promise<InstanceEvent> {
    const existing = this.events.find(predicate);

    if (existing) {
      return Promise.resolve(existing);
    }

    if (this.exited) {
      return Promise.reject(
        new Error(
          `${this.role} already exited while waiting for ${label}: code=${this.exited.code} signal=${this.exited.signal} stderr="${this.stderrTail()}"`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiter = this.waiters.find(
          (candidate) => candidate.label === label,
        );

        if (waiter) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
        }

        reject(
          new Error(
            `Timed out waiting for ${this.role} ${label}. stderr="${this.stderrTail()}" events=${JSON.stringify(
              this.events,
            )}`,
          ),
        );
      }, timeoutMs);

      this.waiters.push({
        label,
        predicate,
        reject,
        resolve,
        timeout,
      });
    });
  }

  public send(command: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  public async stop(): Promise<void> {
    if (!this.exited) {
      this.send({ type: 'stop' });
    }

    await Promise.race([
      this.waitFor('stop', (event) => event.type === 'stopped', 15000).catch(
        (): void => {},
      ),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);

    if (!this.exited) {
      this.child.kill('SIGTERM');
    }
  }
}

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
  const networkKey = generateNetworkKey();
  let relay: E2EInstanceProcess | undefined;
  let leaf: E2EInstanceProcess | undefined;

  try {
    relay = spawnInstance('relay', networkKey);
    const relayReady = (await relay.waitFor(
      'relay-ready',
      (event) => event.type === 'relay-ready',
    )) as RelayReadyEvent;

    leaf = spawnInstance('leaf', networkKey, {
      PRIVATE_RELAY_DISCOVERY_E2E_EXPECTED_RELAY_PEER_ID: relayReady.peerId,
    });
    await leaf.waitFor('leaf-ready', (event) => event.type === 'leaf-ready');

    leaf.send({
      cid: relayReady.cid,
      relayPeerId: relayReady.peerId,
      sha256: relayReady.sha256,
      type: 'assert-pre-fetch',
    });
    await leaf.waitFor(
      'pre-fetch false-positive guard',
      (event) => event.type === 'pre-fetch-ok',
    );

    await assertNoPreDiscoveryPubSub(relay, leaf);

    leaf.send({
      relayPeerId: relayReady.peerId,
      type: 'start-discovery',
    });
    await leaf.waitFor(
      'private relay discovery',
      (event) =>
        event.type === 'connected' && event.peerId === relayReady.peerId,
    );

    leaf.send({
      cid: relayReady.cid,
      sha256: relayReady.sha256,
      type: 'fetch',
    });
    await leaf.waitFor(
      'private IPFS fetch',
      (event) => event.type === 'ipfs-fetch-ok',
    );

    await assertPostDiscoveryPubSub(relay, leaf);
    await assertOrbitDBReplication(relay, leaf);
    const blockstores = await assertRelayBlockstoreIsolation();

    console.info(
      JSON.stringify(
        {
          advertisedRelayAddress: relayReady.advertisedRelayAddress,
          leafPid: await pidOf(leaf),
          networkId: NETWORK_ID,
          relayPeerId: relayReady.peerId,
          relayPid: relayReady.pid,
          result: 'PASS',
          blockstores,
          transportDsn: 'private-relay-public-ipfs-discovery://',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([leaf?.stop(), relay?.stop()]);
    await fs.remove(TMP_ROOT);
  }
}

async function assertRelayBlockstoreIsolation(): Promise<{
  leafPrivateBlocks: number;
  leafPublicRelayBlocks: number;
  relayPrivateBlocks: number;
  relayPublicRelayBlocks: number;
}> {
  const blockstores = {
    leafPrivateBlocks: await countFiles(
      path.join(TMP_ROOT, 'leaf', 'private-ipfs', 'blockstore'),
    ),
    leafPublicRelayBlocks: await countFiles(
      path.join(
        TMP_ROOT,
        'leaf',
        'public-ipfs',
        'public-relay-record-directory',
        'blockstore',
      ),
    ),
    relayPrivateBlocks: await countFiles(
      path.join(TMP_ROOT, 'relay', 'private-ipfs', 'blockstore'),
    ),
    relayPublicRelayBlocks: await countFiles(
      path.join(
        TMP_ROOT,
        'relay',
        'public-ipfs',
        'public-relay-record-directory',
        'blockstore',
      ),
    ),
  };

  if (
    blockstores.leafPrivateBlocks === 0 ||
    blockstores.relayPrivateBlocks === 0
  ) {
    throw new Error(
      `Private IPFS blockstores did not retain transferred content: ${JSON.stringify(blockstores)}`,
    );
  }

  if (
    blockstores.leafPublicRelayBlocks !== 0 ||
    blockstores.relayPublicRelayBlocks !== 0
  ) {
    throw new Error(
      `Public relay routing nodes retained IPFS blocks: ${JSON.stringify(blockstores)}`,
    );
  }

  return blockstores;
}

async function countFiles(directory: string): Promise<number> {
  if (!(await fs.pathExists(directory))) {
    return 0;
  }

  let count = 0;

  for (const entry of await fs.readdir(directory)) {
    const entryPath = path.join(directory, entry);
    const stats = await fs.stat(entryPath);

    count += stats.isDirectory() ? await countFiles(entryPath) : 1;
  }

  return count;
}

async function assertNoPreDiscoveryPubSub(
  relay: E2EInstanceProcess,
  leaf: E2EInstanceProcess,
): Promise<void> {
  const topic = `pigeon-swarm.e2e.${NETWORK_ID}.pre-discovery.${randomUUID()}`;
  const payload = `payload-${randomUUID()}`;

  leaf.send({
    guardMs: FALSE_POSITIVE_GUARD_MS,
    payload,
    topic,
    type: 'subscribe-pre-pubsub',
  });
  await leaf.waitFor(
    'pre-discovery pubsub subscription',
    (event) => event.type === 'pre-pubsub-subscribed' && event.topic === topic,
  );
  relay.send({
    payload,
    topic,
    type: 'publish-pubsub',
  });
  await leaf.waitFor(
    'pre-discovery pubsub false-positive guard',
    (event) => event.type === 'pre-pubsub-ok' && event.topic === topic,
  );
}

async function assertPostDiscoveryPubSub(
  relay: E2EInstanceProcess,
  leaf: E2EInstanceProcess,
): Promise<void> {
  const topic = `pigeon-swarm.e2e.${NETWORK_ID}.post-discovery.${randomUUID()}`;
  const payload = `payload-${randomUUID()}`;

  leaf.send({
    payload,
    topic,
    type: 'subscribe-pubsub',
  });
  await leaf.waitFor(
    'post-discovery pubsub subscription',
    (event) => event.type === 'pubsub-subscribed' && event.topic === topic,
  );
  relay.send({
    payload,
    topic,
    type: 'publish-pubsub',
  });
  await leaf.waitFor(
    'post-discovery pubsub delivery',
    (event) =>
      event.type === 'pubsub-received' &&
      event.topic === topic &&
      event.payload === payload,
  );
}

async function assertOrbitDBReplication(
  relay: E2EInstanceProcess,
  leaf: E2EInstanceProcess,
): Promise<void> {
  const address = `${NETWORK_ID}/documents/e2e-separated-relay-${RUN_ID}`;
  const document = {
    id: `orbitdb-proof-${randomUUID()}`,
    replicated: true,
    runId: RUN_ID,
  };

  relay.send({
    address,
    type: 'open-orbit',
  });
  leaf.send({
    address,
    expectedDocumentId: document.id,
    type: 'open-orbit',
  });
  await Promise.all([
    relay.waitFor(
      'relay OrbitDB open',
      (event) => event.type === 'orbit-open' && event.address === address,
    ),
    leaf.waitFor(
      'leaf OrbitDB open',
      (event) => event.type === 'orbit-open' && event.address === address,
    ),
  ]);
  relay.send({
    document,
    type: 'write-orbit',
  });
  await leaf.waitFor(
    'OrbitDB replication',
    (event) =>
      event.type === 'orbit-replicated' &&
      event.documentId === document.id &&
      event.address === address,
  );
}

function spawnInstance(
  role: InstanceRole,
  networkKey: string,
  extraEnv: NodeJS.ProcessEnv = {},
): E2EInstanceProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    NODE_ENV: 'test',
    PRIVATE_RELAY_DISCOVERY_E2E_INSTANCE_ROLE: role,
    PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_ID: NETWORK_ID,
    PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_KEY: networkKey,
    PRIVATE_RELAY_DISCOVERY_E2E_NETWORK_NAME: NETWORK_NAME,
    PRIVATE_RELAY_DISCOVERY_E2E_RUN_ID: RUN_ID,
    PRIVATE_RELAY_DISCOVERY_E2E_STORAGE_ROOT: path.join(TMP_ROOT, role),
    PIGEON_IPFS_ROUTING_RECORD_TIMEOUT_MS: '15000',
    PIGEON_RELAY_RECORD_DISCOVERY_INTERVAL_MS: '2000',
    PIGEON_RELAY_RECORD_PUBLIC_PEER_WAIT_MS: '10000',
    PIGEON_RELAY_RECORD_PUBLICATION_INTERVAL_MS: '2000',
    PIGEON_RELAY_RECORD_TTL_MS: '600000',
  };

  delete env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED;
  delete env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS;

  const child = spawn(
    TSX_BIN,
    ['-r', 'tsconfig-paths/register', INSTANCE_SCRIPT],
    {
      cwd: ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  return new E2EInstanceProcess(role, child);
}

async function pidOf(
  instance: E2EInstanceProcess,
): Promise<number | undefined> {
  const readyEvent = await instance.waitFor(
    'pid',
    (event) => event.type === 'leaf-ready' || event.type === 'relay-ready',
    1000,
  );

  return typeof readyEvent.pid === 'number' ? readyEvent.pid : undefined;
}

function generateNetworkKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');

  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
