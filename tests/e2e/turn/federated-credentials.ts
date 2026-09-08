import { FederatedTurnCredential } from '@app/apps/apis/calls-api/types/FederatedTurnCredential';
import 'reflect-metadata';
import Kernel from '@haskou/ddd-kernel';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { PrivateIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { IPFSNetworkConfig } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import { defaultRelayRuntimeSettings } from '@app/shared/infrastructure/network/relay/RelayRuntimeSettings';
import FederatedCallRelayCredentials from '@app/apps/apis/calls-api/FederatedCallRelayCredentials';
import CallRelayRecordDiscovery from '@app/apps/apis/calls-api/CallRelayRecordDiscovery';
import CallRelayRecordRegistry from '@app/apps/apis/calls-api/CallRelayRecordRegistry';
import CallRelayRecordSigner from '@app/apps/apis/calls-api/CallRelayRecordSigner';
import CallRelayCredentialIssuer from '@app/apps/apis/calls-api/CallRelayCredentialIssuer';
import assert from 'node:assert/strict';
import { fork, spawnSync, ChildProcess } from 'node:child_process';
import { generateKeyPairSync, randomBytes, createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

new Kernel({ logger: { debug() {}, info() {}, warn() {}, error() {} } });
let network: IPFSNetwork | undefined;
const records = new CallRelayRecordRegistry();
const signer = new CallRelayRecordSigner();
const discovery = new CallRelayRecordDiscovery(records, signer);

async function waitFor<T>(
  read: () => T | undefined,
  label: string,
): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function createNetwork(key: string, root: string, relay: boolean) {
  const privateKey = await libp2pKeyAdapter.generateEd25519KeyPair();
  const connection = await PrivateIPFS.create({
    key: new PrivateKey(key),
    name: 'turn-federation-test',
    privateKey,
    listenAddresses: relay ? ['/ip4/127.0.0.1/tcp/0'] : [],
    enableRelayServer: relay,
    storageLocation: root,
  });
  network = new IPFSNetwork(
    IPFSNetworkConfig.fromPrimitives({
      id: 'turn-test',
      name: 'turn-federation-test',
      key,
    }),
    connection,
  );
  const registry = Object.assign(
    Object.create(IPFSNetworkRegistry.prototype) as IPFSNetworkRegistry,
    {
      getAll: () => (network ? [network] : []),
      getRelaySettings: defaultRelayRuntimeSettings,
    },
  );
  const service = new FederatedCallRelayCredentials(
    registry,
    records,
    new CallRelayCredentialIssuer(),
  );
  await service.start(network);
  await discovery.startConnection(network, true);
  return { network, service, privateKey };
}

async function owner(): Promise<void> {
  const { network: ownerNetwork, privateKey } = await createNetwork(
    process.env.TURN_TEST_NETWORK_KEY!,
    process.env.TURN_TEST_STORAGE!,
    true,
  );
  const address = await waitFor(
    () =>
      ownerNetwork.getMultiaddrs().find((address) => address.includes('/tcp/')),
    'owner TCP address',
  );
  process.send!({ type: 'ready', address, peerId: ownerNetwork.getPeerId() });
  const publish = async () => {
    const now = Date.now();
    const record = (
      await signer.sign(
        {
          version: 2,
          role: 'call-relay',
          issuedAt: now,
          expiresAt: now + 600_000,
          urls: [process.env.CALLS_TURN_URLS!],
        },
        privateKey,
        process.env.CALLS_TURN_SHARED_SECRET!,
      )
    ).toPrimitives();
    await discovery.publishConnection(ownerNetwork, record);
    return record;
  };
  const timer = setInterval(() => {
    void publish().catch((): void => {});
  }, 250);
  process.on('message', (message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'rotate' &&
      'secret' in message &&
      typeof message.secret === 'string'
    ) {
      process.env.CALLS_TURN_SHARED_SECRET = message.secret;
      void publish().then(
        (record) => {
          process.send!({
            type: 'rotated',
            issuedAt: record.issuedAt,
            peerId: record.peerId,
          });
        },
        () => process.exit(1),
      );
    }
    if (message === 'stop') {
      clearInterval(timer);
      void ownerNetwork.stop().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    }
  });
}

function docker(args: string[], success = true): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  assert(!result.error, `Docker ${args[0]} exceeded its deadline`);
  if (success) assert.equal(result.status, 0, `Docker ${args[0]} failed`);
  return result.stdout + result.stderr;
}

function probe(
  container: string,
  credential: FederatedTurnCredential,
  accepted: boolean,
): void {
  const output = docker(
    [
      'exec',
      container,
      'turnutils_uclient',
      '-y',
      '-c',
      '-m',
      '2',
      '-n',
      '2',
      '-v',
      '-u',
      credential.username,
      '-w',
      credential.credential,
      '-p',
      '3478',
      '127.0.0.1',
    ],
    false,
  );
  const delivered = [...output.matchAll(/tot_recv_msgs=(\d+)/g)].some(
    (match) => Number(match[1]) > 0,
  );
  assert.equal(delivered, accepted, 'Unexpected coturn packet delivery result');
  if (!accepted)
    assert.ok(
      /Cannot complete Allocation/.test(output),
      'Negative probe must reach coturn authentication',
    );
}

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'pigeon-federated-turn-'));
  const container = `pigeon-federated-turn-${randomBytes(6).toString('hex')}`;
  const ownerSecret = randomBytes(32).toString('hex');
  const requesterSecret = randomBytes(32).toString('hex');
  const key = generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
  const url = 'turn:127.0.0.1:3478?transport=udp';
  let child: ChildProcess | undefined;
  let containerCreated = false;
  const startCoturn = (secret: string) => {
    docker([
      'create',
      '--name',
      container,
      'coturn/coturn:4.11.0-r0-alpine',
      '--no-cli',
      '--no-tls',
      '--no-dtls',
      '--allow-loopback-peers',
      '--realm=pigeon-test',
      '--use-auth-secret',
      `--static-auth-secret=${secret}`,
      '--min-port=50000',
      '--max-port=50030',
      '--relay-threads=1',
      '--log-file=stdout',
    ]);
    containerCreated = true;
    docker(['start', container]);
    docker([
      'exec',
      container,
      'sh',
      '-c',
      'for n in 1 2 3 4 5 6 7 8 9 10; do nc -z -w 1 127.0.0.1 3478 && exit 0; sleep 1; done; exit 1',
    ]);
  };
  try {
    startCoturn(ownerSecret);
    process.env.CALLS_TURN_SHARED_SECRET = requesterSecret;
    delete process.env.CALLS_TURN_URLS;
    child = fork(__filename, [], {
      execArgv: ['--import', 'tsx', '--require', 'tsconfig-paths/register'],
      env: {
        ...process.env,
        TURN_TEST_OWNER: 'true',
        TURN_TEST_NETWORK_KEY: key,
        TURN_TEST_STORAGE: path.join(root, 'owner'),
        CALLS_TURN_SHARED_SECRET: ownerSecret,
        CALLS_TURN_URLS: url,
      },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    const ready = await new Promise<{ address: string; peerId: string }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Owner startup timeout')),
          30_000,
        );
        child!.once('message', (value) => {
          clearTimeout(timer);
          resolve(value as { address: string; peerId: string });
        });
        child!.once('exit', () => {
          clearTimeout(timer);
          reject(new Error('Owner exited before ready'));
        });
      },
    );
    const wrongKey = generateKeyPairSync('ed25519')
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString();
    const outsider = await PrivateIPFS.create({
      key: new PrivateKey(wrongKey),
      name: 'turn-federation-test',
      privateKey: await libp2pKeyAdapter.generateEd25519KeyPair(),
      listenAddresses: [],
      enableRelayServer: false,
      storageLocation: path.join(root, 'outsider'),
    });
    try {
      await assert.rejects(() =>
        outsider.dial(ready.address, AbortSignal.timeout(5000)),
      );
      assert.equal(outsider.getHeliaCore().libp2p.getConnections().length, 0);
      console.log(
        'PASS different private-network key cannot connect to the relay owner',
      );
    } finally {
      await outsider.stop();
    }
    const { network: requester, service } = await createNetwork(
      key,
      path.join(root, 'requester'),
      false,
    );
    assert.equal(
      (await service.get()).length,
      0,
      'Ineligible relay must return no credentials',
    );
    await requester.dial(ready.address, AbortSignal.timeout(10_000));
    await requester.listen(`${ready.address}/p2p-circuit`);
    await waitFor(
      () =>
        requester.getConnectedRelayPeerIds().includes(ready.peerId) ||
        undefined,
      'real relay reservation',
    );
    const record = await waitFor(
      () => records.all().find((record) => record.peerId === ready.peerId),
      'signed gossip announcement',
    );
    assert.equal(record.version, 2);
    assert.equal(
      await signer.verify(record, record.signature, requesterSecret),
      true,
    );
    assert.equal(
      await signer.verify(
        { ...record, urls: ['turn:tampered.invalid:3478'] },
        record.signature,
        requesterSecret,
      ),
      false,
    );
    assert.equal(
      await signer.verify(
        { ...record, version: 1 },
        record.signature,
        requesterSecret,
      ),
      false,
    );
    assert.deepEqual(records.urlsForPeers([ready.peerId]), []);
    const issued = await service.get();
    assert.equal(
      issued.length,
      1,
      'Real authenticated stream returned no credentials',
    );
    assert.ok(
      issued[0].credential ===
        createHmac('sha1', ownerSecret)
          .update(issued[0].username)
          .digest('base64'),
      'Owner must issue the credentials',
    );
    assert.ok(
      issued[0].credential !==
        createHmac('sha1', requesterSecret)
          .update(issued[0].username)
          .digest('base64'),
      'Requester secret must remain independent',
    );
    for (let i = 0; i < 11; i++)
      assert.ok(
        JSON.stringify(await service.get()) === JSON.stringify(issued),
        'Sequential requests should reuse credentials',
      );
    probe(container, issued[0], true);
    probe(
      container,
      new CallRelayCredentialIssuer().issue(
        'requester',
        [url],
        requesterSecret,
      ),
      false,
    );
    console.log(
      'PASS two processes: private relay reservation, signed gossip, encrypted credential stream, independent secrets and real coturn packet delivery',
    );
    const rotatedSecret = randomBytes(32).toString('hex');
    docker(['rm', '-f', container]);
    containerCreated = false;
    startCoturn(rotatedSecret);
    const rotated = await new Promise<{ issuedAt: number; peerId: string }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Owner rotation timeout')),
          10000,
        );
        child!.once('message', (value) => {
          clearTimeout(timer);
          resolve(value as { issuedAt: number; peerId: string });
        });
        child!.send({ type: 'rotate', secret: rotatedSecret });
      },
    );
    assert.equal(rotated.peerId, ready.peerId);
    const newer = await waitFor(
      () =>
        records
          .all()
          .find(
            (candidate) =>
              candidate.peerId === ready.peerId &&
              candidate.issuedAt >= rotated.issuedAt,
          ),
      'new signed gossip announcement after owner rotation',
    );
    assert.ok(newer.issuedAt > record.issuedAt);
    assert.deepEqual(newer.urls, record.urls);
    const renewed = await service.get();
    assert.equal(renewed.length, 1, 'Rotation must obtain fresh credentials');
    assert.ok(
      renewed[0].credential !== issued[0].credential,
      'Cached credentials must be replaced',
    );
    assert.ok(
      renewed[0].credential ===
        createHmac('sha1', rotatedSecret)
          .update(renewed[0].username)
          .digest('base64'),
      'New owner secret must sign renewed credentials',
    );
    probe(container, renewed[0], true);
    probe(container, issued[0], false);
    console.log(
      'PASS same owner peer and URLs: signed gossip refreshes rotated credentials; old credentials are rejected',
    );
    await Promise.all(
      requester
        .getHeliaCore()
        .libp2p.getConnections()
        .map((connection) => connection.close()),
    );
    assert.equal(
      (await service.get()).length,
      0,
      'Ineligible relay must return no credentials',
    );
    console.log(
      'PASS disconnected relay is removed even while cached credentials remain valid',
    );
  } finally {
    await network?.stop();
    if (child && child.exitCode === null) {
      child.send('stop');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child!.kill('SIGKILL');
        }, 10_000);
        child!.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (containerCreated) docker(['rm', '-f', container]);
    await rm(root, { recursive: true, force: true });
  }
}

void (process.env.TURN_TEST_OWNER === 'true' ? owner() : main()).catch(
  (error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Federated TURN regression failed',
    );
    process.exit(1);
  },
);
