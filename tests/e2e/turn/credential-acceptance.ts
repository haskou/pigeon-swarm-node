import 'reflect-metadata';

import { CallIceServerConfig } from '@app/apps/apis/calls-api/CallIceServerConfig';
import CallRelayRecordDiscovery from '@app/apps/apis/calls-api/CallRelayRecordDiscovery';
import CallRelayRecordRegistry from '@app/apps/apis/calls-api/CallRelayRecordRegistry';
import CallRelayRecordSigner from '@app/apps/apis/calls-api/CallRelayRecordSigner';
import { CallTurnSharedSecret } from '@app/apps/apis/calls-api/CallTurnSharedSecret';
import { CallIceServerResource } from '@app/apps/apis/calls-api/resources/CallIceServersResource';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { libp2pKeyAdapter } from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const image = 'coturn/coturn:4.11.0-r0-alpine';
const runId = `pigeon-turn-${randomBytes(6).toString('hex')}`;
const containers: string[] = [];
const identity = new IdentityId(
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
);
const registry = new CallRelayRecordRegistry();
const signer = new CallRelayRecordSigner();
const originalSecret = process.env.CALLS_TURN_SHARED_SECRET;

function docker(args: string[], requireSuccess = true): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 25_000,
    maxBuffer: 1024 * 1024,
  });

  assert(
    !result.error,
    `Docker ${args[0]} did not complete within its deadline`,
  );
  if (requireSuccess) {
    assert.equal(result.status, 0, `Docker ${args[0]} failed`);
  }

  return `${result.stdout}${result.stderr}`;
}

function startServer(suffix: string, secret: string): string {
  const name = `${runId}-${suffix}`;
  docker([
    'create',
    '--name',
    name,
    '--network',
    runId,
    image,
    '--no-cli',
    '--no-tls',
    '--no-dtls',
    '--fingerprint',
    '--realm=pigeon-test',
    '--use-auth-secret',
    `--static-auth-secret=${secret}`,
    '--min-port=50000',
    '--max-port=50030',
    '--relay-threads=1',
    '--log-file=stdout',
  ]);
  containers.push(name);
  docker(['start', name]);
  docker([
    'exec',
    name,
    'sh',
    '-c',
    'for attempt in 1 2 3 4 5 6 7 8 9 10; do nc -z -w 1 127.0.0.1 3478 && exit 0; sleep 1; done; exit 1',
  ]);
  return name;
}

function credentials(
  secret: string,
  server: string,
  ttl = 60,
): CallIceServerResource {
  return CallIceServerConfig.fromEnvironment({
    CALLS_TURN_SHARED_SECRET: secret,
    CALLS_TURN_URLS: `turn:${server}:3478?transport=udp`,
    CALLS_TURN_CREDENTIAL_TTL_SECONDS: ttl,
  }).toResource(identity).iceServers[0];
}

function probe(
  server: string,
  config: CallIceServerResource,
  accepted: boolean,
): void {
  assert(
    config.username && config.credential,
    'Backend did not issue credentials',
  );
  assert(
    config.urls.includes(`turn:${server}:3478?transport=udp`),
    'Selected configuration does not name the probed server',
  );
  const output = docker(
    [
      'exec',
      containers[0],
      'turnutils_uclient',
      '-y',
      '-c',
      '-m',
      '2',
      '-n',
      '2',
      '-v',
      '-u',
      config.username,
      '-w',
      config.credential,
      '-p',
      '3478',
      server,
    ],
    false,
  );
  const received = [...output.matchAll(/tot_recv_msgs=(\d+)/g)];
  const delivered = received.some((match) => Number(match[1]) > 0);

  if (accepted) {
    assert(
      delivered,
      'Coturn did not relay packets with backend-issued credentials',
    );
  } else {
    assert(!delivered, 'Coturn accepted credentials it should reject');
    assert(
      /allocate response received/.test(output) &&
        /Cannot complete Allocation/.test(output),
      'Negative probe did not receive an allocation rejection from coturn',
    );
  }
}

async function sharedPool(secret: string, servers: string[]): Promise<void> {
  process.env.CALLS_TURN_SHARED_SECRET = secret;
  registry.clear();
  const discovery = new CallRelayRecordDiscovery(registry, signer);
  let receive: (payload: string) => Promise<void> = async () => {
    throw new Error('Discovery did not subscribe');
  };
  await discovery.startConnection({
    publishPubSub: async () => undefined,
    subscribePubSub: async (_topic, handler) => {
      receive = handler;
    },
  });
  const peers: string[] = [];

  for (const server of servers) {
    const key = await libp2pKeyAdapter.generateEd25519KeyPair();
    const now = Date.now();
    const record = (
      await signer.sign(
        {
          expiresAt: now + 60_000,
          issuedAt: now,
          role: 'call-relay',
          urls: [`turn:${server}:3478?transport=udp`],
          version: 1,
        },
        key,
        secret,
      )
    ).toPrimitives();
    await receive(
      JSON.stringify({ ...record, urls: ['turn:tampered.invalid:3478'] }),
    );
    assert.equal(
      registry.all().length,
      peers.length,
      'Tampered record was accepted',
    );
    await receive(JSON.stringify(record));
    peers.push(record.peerId);
    assert.equal(
      registry.all().length,
      peers.length,
      'Signed pool record was rejected',
    );
    assert.equal(
      await signer.verify(record, record.signature, secret, record.expiresAt),
      false,
    );
    assert.equal(
      await signer.verify(
        record,
        record.signature,
        randomBytes(32).toString('hex'),
      ),
      false,
    );
  }

  const resource = CallIceServerConfig.fromEnvironment({
    CALLS_TURN_SHARED_SECRET: secret,
  }).toResource(identity, registry.urlsForPeers(peers));
  assert.equal(resource.diagnostics.turnSource, 'connected-relay-record');
  assert.equal(resource.iceServers[0].urls.length, servers.length);
  for (const server of servers) probe(server, resource.iceServers[0], true);
  assert.deepEqual(registry.urlsForPeers(['unconnected']), []);
  assert.deepEqual(registry.urlsForPeers(peers, Date.now() + 60_001), []);
  console.log(
    'PASS shared pool: real signed discovery, selected credentials accepted by both coturn servers',
  );
}

async function main(): Promise<void> {
  let networkCreated = false;
  const failures: unknown[] = [];
  try {
    docker(['network', 'create', '--internal', runId]);
    networkCreated = true;
    const secretA = randomBytes(32).toString('hex');
    const secretB = randomBytes(32).toString('hex');
    const serverA = startServer('a', secretA);
    const serverB = startServer('b', secretB);
    const serverPool = startServer('pool', secretA);
    const first = credentials(secretA, serverA, 10);
    probe(serverA, first, true);
    probe(serverB, credentials(secretB, serverB), true);
    probe(serverB, credentials(secretA, serverB), false);
    probe(serverB, credentials(secretB, serverB), true);
    console.log(
      'PASS independent servers: matching credentials accepted; another issuer secret rejected',
    );
    const expiresAt = Number(first.username!.split(':')[0]) * 1000;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, expiresAt - Date.now()) + 1_000),
    );
    probe(serverA, first, false);
    probe(serverA, credentials(secretA, serverA), true);
    console.log(
      'PASS expired credentials rejected; renewed backend credentials accepted',
    );
    assert.deepEqual(
      CallIceServerConfig.fromEnvironment({
        CALLS_TURN_SHARED_SECRET: CallTurnSharedSecret.REJECTED_PUBLIC_SECRET,
        CALLS_TURN_URLS: `turn:${serverA}:3478`,
      }).toResource(identity).iceServers,
      [],
    );
    await sharedPool(secretA, [serverA, serverPool]);
    for (const server of [serverA, serverPool]) {
      docker(['rm', '-f', server]);
      containers.splice(containers.indexOf(server), 1);
    }
    startServer('a', secretB);
    startServer('pool', secretB);
    for (const server of [serverA, serverPool]) {
      probe(server, credentials(secretA, server), false);
      probe(server, credentials(secretB, server), true);
    }
    await sharedPool(secretB, [serverA, serverPool]);
    console.log(
      'PASS coordinated pool restart: old secret rejected and updated discovery/issuer credentials accepted',
    );
  } catch (error) {
    failures.push(error);
  } finally {
    registry.clear();
    if (originalSecret === undefined)
      delete process.env.CALLS_TURN_SHARED_SECRET;
    else process.env.CALLS_TURN_SHARED_SECRET = originalSecret;
    for (const container of containers.reverse()) {
      try {
        docker(['rm', '-f', container]);
      } catch (error) {
        failures.push(error);
      }
    }
    if (networkCreated) {
      try {
        docker(['network', 'rm', runId]);
      } catch (error) {
        failures.push(error);
      }
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'TURN credential acceptance failed');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
