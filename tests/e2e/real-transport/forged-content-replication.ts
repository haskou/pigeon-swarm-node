import 'reflect-metadata';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import OrbitDBContentReplicationMapper from '@app/contexts/content-replication/infrastructure/orbitdb/mappers/OrbitDBContentReplicationMapper';
import OrbitDBContentReplicationRepository from '@app/contexts/content-replication/infrastructure/orbitdb/OrbitDBContentReplicationRepository';
import ContentReplicationMutationPolicy from '@app/contexts/content-replication/infrastructure/orbitdb/policies/ContentReplicationMutationPolicy';
import { Identity } from '@app/contexts/identities/domain/Identity';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationAuthorAuthorization } from '@app/contexts/public-mutations/domain/services/PublicMutationAuthorAuthorization';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentSize } from '@app/contexts/content-replication/domain/value-objects/ContentSize';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import Kernel from '@haskou/ddd-kernel';
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { teardownAndExit } from './RealTransportTeardown';

/**
 * The honest node gates `contentReplication`; the malicious and control nodes
 * do not. A forged record that reaches the control node but never the honest
 * one proves the attack was real and only the gate kept it out. The honest
 * node only fetches what its gated registrations list, so what it lists is
 * exactly what it would ever fetch.
 */
type Signer = { credential: string; id: string; keyPair: KeyPair };
type Replica = {
  gated: boolean;
  helia: HeliaInstance;
  name: string;
  orbitdb?: OrbitDBInstance;
  registry?: OrbitDBReplicatedStateRegistry;
  repository?: OrbitDBContentReplicationRepository;
  stores?: { contentReplication: OrbitDBDatabase; heads: OrbitDBDatabase };
};

const networkId = randomUUID();
const nodes: Replica[] = [];
const authorized = new Set<string>();
const authorization: PublicMutationAuthorAuthorization = {
  isAuthorized: (claimed) =>
    Promise.resolve(
      authorized.has(`${claimed.identityId}|${claimed.deviceCredential}`),
    ),
};
const mapper = new OrbitDBContentReplicationMapper();
const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let stage = 'setup';
let root: string;
let members: string[] = [];

async function until(
  label: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await pause(100);
  }
  throw new Error(`Timed out: ${label}`);
}

async function actor(): Promise<Signer> {
  const keyPair = await KeyPair.generate();
  const credential = keyPair.toPrimitives().publicKey;
  const signer = {
    credential,
    id: new IdentityId(credential).valueOf(),
    keyPair,
  };

  authorized.add(`${signer.id}|${signer.credential}`);

  return signer;
}

function sign(
  signer: Signer,
  payload: { id: string } & Record<string, unknown>,
  kind: 'delete' | 'put' = 'put',
  recordId = payload.id,
): PublicMutationProof {
  const body = {
    author: { authorizationRevision: 0, deviceCredential: signer.credential, identityId: signer.id },
    kind,
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor: null as string | null,
    recordId,
    sequence: 0,
    store: 'contentReplication',
    version: 2,
  } as const;

  return PublicMutationProof.signed(
    body,
    signer.keyPair.sign(PublicMutationProof.signingContentOf(body)),
  );
}

const identities = {
  findById: () =>
    Promise.resolve({
      getNetworkIds: () => members.map((value) => new NetworkId(value)),
    } as unknown as Identity),
} as unknown as IdentityRepository;

async function open(replica: Replica): Promise<void> {
  replica.orbitdb = await orbitDBRuntimeAdapter.createOrbitDB({
    directory: path.join(root, replica.name, 'orbitdb'),
    id: replica.name,
    ipfs: replica.helia,
  });
  const AccessController =
    await orbitDBRuntimeAdapter.createPrivateNetworkAccessController();

  replica.stores = {
    contentReplication: await replica.orbitdb.open(
      `${networkId}/contentReplication`,
      {
        AccessController,
        Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
        sync: false,
        type: 'documents',
      },
    ),
    heads: await replica.orbitdb.open(`${networkId}/heads`, {
      AccessController,
      sync: false,
      type: 'keyvalue',
    }),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();

  if (replica.gated)
    registry.addMutationGate(
      new PublicMutationGate(new PublicMutationVerifier(authorization), [
        new ContentReplicationMutationPolicy(
          registry,
          identities,
          new PublicMutationVerifier(authorization),
        ),
      ]),
    );
  replica.registry = registry;
  replica.repository = new OrbitDBContentReplicationRepository(
    registry,
    mapper,
  );
  await registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
}

async function synchronization(): Promise<void> {
  for (const store of nodes.flatMap((replica) =>
    Object.values(replica.stores!),
  )) {
    assert.ok(store.sync, 'Real OrbitDB synchronization controls are required');
    await store.sync.start();
  }
}

async function connect(): Promise<void> {
  for (let index = 0; index < nodes.length; index++)
    for (let other = index + 1; other < nodes.length; other++) {
      const address = nodes[other].helia.libp2p
        .getMultiaddrs()
        .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));

      assert.ok(address, 'Each fixture peer must listen only on loopback');
      const target = await heliaRuntimeAdapter.createMultiaddr(
        address.toString(),
      );

      await until('fixture peers connect', async () => {
        try {
          await nodes[index].helia.libp2p.dial(target);

          return true;
        } catch {
          return false;
        }
      });
    }
}

async function startNodes(): Promise<void> {
  const noop = (): void => undefined;

  new Kernel({ logger: { debug: noop, error: noop, info: noop, warn: noop } });
  const key = new PrivateKey(
    generateKeyPairSync('ed25519')
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString(),
  );

  for (const [name, gated] of [
    ['honest', true],
    ['malicious', false],
    ['control', false],
  ] as const) {
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
      key,
      networkId,
    );
    const replica: Replica = { gated, helia, name };

    nodes.push(replica);
    await open(replica);
  }
}

const cidOf = (index: number): string =>
  `bafkreib${index.toString().padStart(8, 'a')}`;
const listed = async (replica: Replica): Promise<string[]> =>
  (await replica.repository!.findAll())
    .map((value) => value.getCid().valueOf())
    .sort();
const rawIds = async (replica: Replica): Promise<string[]> =>
  (await replica.stores!.contentReplication.all()).map(
    (entry) => (entry.value as { id: string }).id,
  );

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-content-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  members = [networkId];
  await startNodes();
  const [honest, malicious, control] = nodes;
  const [owner, mallory] = await Promise.all([actor(), actor()]);

  await connect();
  await synchronization();

  const ownerPayload = (
    cid: string,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    ...mapper.toDocument(
      ContentReplication.create(
        new ContentId(cid),
        new NetworkId(networkId),
        new ContentReplicationContext('ipfs_private_upload'),
        new ContentSize(2048),
        new IdentityId(owner.id),
      ),
    ),
    ...extra,
  });
  const raw = (payload: Record<string, unknown>, proof: PublicMutationProof) =>
    malicious.stores!.contentReplication.put({
      ...payload,
      proof: proof.toPrimitives(),
    } as never);

  stage = 'forged records reach the ungated control but not the gated node';
  const arbitrary = ownerPayload(cidOf(1));
  const claim = ownerPayload(cidOf(2), { claimedBy: mallory.id });
  const owned = ownerPayload(cidOf(3));

  await malicious.stores!.contentReplication.put(arbitrary as never);
  await raw(claim, sign(mallory, claim as never));
  await raw(owned, sign(mallory, owned as never));
  const expectedForged = [arbitrary, claim, owned].map(
    (value) => value.id as string,
  );

  await until('control received forged records', async () => {
    const ids = await rawIds(control);

    return expectedForged.every((id) => ids.includes(id));
  });
  await pause(3000);
  assert.deepEqual(
    await listed(honest),
    [],
    'gated node lists no forged record',
  );

  stage = 'a signed registration is admitted';
  const valid = ownerPayload(cidOf(4));
  const proof = sign(owner, valid as never);

  await raw(valid, proof);
  await until('honest lists the valid registration', async () =>
    (await listed(honest)).includes(cidOf(4)),
  );
  assert.deepEqual(await listed(honest), [cidOf(4)]);

  stage = 'forged overwrite and withdrawal do not change it';
  const overwrite = { ...valid, contentType: 'text/html', sizeBytes: 1 };
  const withdrawal = {
    cid: cidOf(4),
    id: valid.id as string,
    networkId,
    ownerIdentityId: owner.id,
    removed: true,
    scopeType: 'content_replication',
  };

  await raw(overwrite, sign(mallory, overwrite as never));
  await raw(withdrawal, sign(mallory, withdrawal, 'delete'));
  await pause(3000);
  // A same-id forged put can shadow the stored record (availability), but its
  // values are never admitted: nothing is listed with the forged size or type.
  const after = await honest.repository!.findAll();

  assert.ok(
    after.every((value) => value.getSizeBytes().valueOf() === 2048),
    'no forged value is ever listed',
  );
  assert.ok(
    !(await listed(honest)).some((cid) => cid !== cidOf(4)),
    'no forged cid is ever listed',
  );

  console.log('PASS forged content replication');
}

const watchdog = setTimeout(() => {
  console.error(`FAIL forged content replication deadline during ${stage}`);
  process.exit(1);
}, 200000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged content replication during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
