import 'reflect-metadata';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import OrbitDBDeviceAuthorizationRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import {
  HeliaInstance,
  heliaRuntimeAdapter,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import Kernel from '@haskou/ddd-kernel';
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

interface Replica {
  helia: HeliaInstance;
  name: string;
  orbitdb?: OrbitDBInstance;
  registry?: OrbitDBReplicatedStateRegistry;
  repository?: OrbitDBDeviceAuthorizationRepository;
  stores?: { heads: OrbitDBDatabase; identities: OrbitDBDatabase };
}

const networkId = randomUUID();
const nodes: Replica[] = [];
const now = new Timestamp(1_800_000_000_000);
let root: string;
let stage = 'setup';

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function until(
  label: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await pause(100);
  }

  throw new Error(`Timed out: ${label}`);
}

async function open(replica: Replica): Promise<void> {
  replica.orbitdb = await orbitDBRuntimeAdapter.createOrbitDB({
    directory: path.join(root, replica.name, 'orbitdb'),
    id: replica.name,
    ipfs: replica.helia,
  });
  const AccessController =
    await orbitDBRuntimeAdapter.createPrivateNetworkAccessController();
  replica.stores = {
    heads: await replica.orbitdb.open(`${networkId}/heads`, {
      AccessController,
      sync: false,
      type: 'keyvalue',
    }),
    identities: await replica.orbitdb.open(`${networkId}/identities`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  replica.registry = new OrbitDBReplicatedStateRegistry();
  replica.repository = new OrbitDBDeviceAuthorizationRepository(
    replica.registry,
    new DeviceAuthorizationPolicy(),
    {} as IdentityRepository,
  );
  await replica.registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
}

async function connect(): Promise<void> {
  const address = nodes[1].helia.libp2p
    .getMultiaddrs()
    .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));
  assert.ok(address, 'The second fixture peer must listen on loopback');
  const target = await heliaRuntimeAdapter.createMultiaddr(address.toString());
  await until('private peers connect', async () => {
    try {
      await nodes[0].helia.libp2p.dial(target);

      return true;
    } catch {
      return false;
    }
  });
}

async function startSynchronization(): Promise<void> {
  for (const node of nodes)
    for (const store of Object.values(node.stores!)) {
      assert.ok(store.sync, 'Real OrbitDB synchronization is required');
      await store.sync.start();
    }
}

async function verifyExchange(): Promise<void> {
  await until('OrbitDB peers join', async () =>
    nodes.every((node) =>
      Object.values(node.stores!).every(
        (store) => (store.peers?.size ?? 0) > 0,
      ),
    ),
  );
  for (let index = 0; index < nodes.length; index += 1) {
    const key = `fixture-exchange:${randomUUID()}:${index}`;
    const sentinel = { id: key, nonce: randomUUID() };
    await nodes[index].stores!.heads.put!(key, sentinel);
    await nodes[index].stores!.identities.put!(sentinel);
    await until('OrbitDB stores exchange', async () => {
      for (const node of nodes) {
        if (!isDeepStrictEqual(await node.stores!.heads.get!(key), sentinel))
          return false;
        const identities = await node.stores!.identities.query!(
          (record) => record.id === key,
        );
        if (!identities.some((record) => isDeepStrictEqual(record, sentinel)))
          return false;
      }

      return true;
    });
  }
}

async function enrollment(
  identityId: IdentityId,
  owner: KeyPair,
  target: KeyPair,
  operationId: string,
  pairingId: string,
): Promise<DeviceAuthorizationTransition> {
  const unsigned = DeviceAuthorizationTransition.enrollment(
    identityId,
    new DeviceAuthorizationOperationId(operationId),
    DeviceAuthorizationRevision.initial(),
    DeviceCredential.fromString(owner.toPrimitives().publicKey),
    DeviceCredential.fromString(target.toPrimitives().publicKey),
    new PairingAuthorization(
      new PairingId(pairingId),
      new PairingExpiration(now.valueOf() + 60_000),
      now,
    ),
  );

  return unsigned.authorize(
    owner.sign(unsigned.getSigningPayload()),
    target.sign(unsigned.getProofOfPossessionPayload()),
  );
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-device-authorization-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  const noop = (): void => undefined;
  new Kernel({ logger: { debug: noop, error: noop, info: noop, warn: noop } });
  const swarmKey = new PrivateKey(
    generateKeyPairSync('ed25519')
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString(),
  );

  for (const name of ['first', 'second']) {
    const helia = await HeliaIPFS.createPrivateHeliaCore(
      {
        contentRoutingEnabled: false,
        distributedHashTableEnabled: false,
        listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
        localPeerDiscoveryEnabled: false,
        manualRelayMultiaddrs: [],
        publicRelayDiscoveryEnabled: false,
        storageLocation: path.join(root, name, 'ipfs'),
      },
      swarmKey,
      networkId,
    );
    const replica = { helia, name };
    nodes.push(replica);
    await open(replica);
  }
  assert.equal(
    new Set(nodes.map((node) => node.stores!.heads.address)).size,
    1,
  );

  const identity = await KeyPair.generate();
  const owner = await KeyPair.generate();
  const recovery = await KeyPair.generate();
  const identityId = new IdentityId(identity.toPrimitives().publicKey);
  const genesis = DeviceAuthorization.genesis(
    identityId,
    [new NetworkId(networkId)],
    DeviceCredential.fromString(owner.toPrimitives().publicKey),
    RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
  );
  await Promise.all(nodes.map((node) => node.repository!.provision(genesis)));

  stage = 'partitioned concurrent authorization';
  const firstDevice = await KeyPair.generate();
  const secondDevice = await KeyPair.generate();
  const winner = await enrollment(
    identityId,
    owner,
    firstDevice,
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
  );
  const loser = await enrollment(
    identityId,
    owner,
    secondDevice,
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
  );
  await Promise.all([
    nodes[0].repository!.compareAndApply(winner),
    nodes[1].repository!.compareAndApply(loser),
  ]);

  stage = 'real OrbitDB convergence';
  await connect();
  await startSynchronization();
  await verifyExchange();
  await until('both replicas choose the deterministic transition', async () => {
    const authorizations = await Promise.all(
      nodes.map(async (node) =>
        (await node.repository!.find(identityId))?.toPrimitives(),
      ),
    );

    return authorizations.every(
      (authorization) =>
        authorization?.revision === 1 &&
        authorization.credentials.includes(
          firstDevice.toPrimitives().publicKey,
        ) &&
        !authorization.credentials.includes(
          secondDevice.toPrimitives().publicKey,
        ),
    );
  });

  console.log(
    'PASS device authorization convergence: two real private Helia/OrbitDB replicas resolved partitioned concurrent enrollment deterministically. Local loopback transport only; no external NAT claim.',
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL device authorization convergence during ${stage}`);
  process.exit(1);
}, 120_000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`FAIL device authorization convergence during ${stage}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const results = await Promise.allSettled(
        nodes.map(async (node) => {
          node.registry?.clear();
          try {
            await node.orbitdb?.stop();
          } finally {
            await node.helia.stop();
          }
        }),
      );
      if (results.some((result) => result.status === 'rejected'))
        process.exitCode = 1;
      if (root) await rm(root, { force: true, recursive: true });
    } finally {
      clearTimeout(watchdog);
    }
  });
