import 'reflect-metadata';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { Profile } from '@app/contexts/identities/domain/Profile';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileHandle } from '@app/contexts/identities/domain/value-objects/ProfileHandle';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import OrbitDBIdentityMetadataProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataProjection';
import { OrbitDBIdentityMutationGate } from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMutationGate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import Kernel from '@haskou/ddd-kernel';
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { teardownAndExit } from './RealTransportTeardown';

type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: { heads: OrbitDBDatabase; identities: OrbitDBDatabase };
  registry?: OrbitDBReplicatedStateRegistry;
  index?: OrbitDBIdentityMetadataIndex;
};

type Signer = { device: KeyPair; id: KeyPair; recovery: KeyPair };

const networkId = randomUUID();
const mapper = new IpfsIdentityMapper();
const ipfs = new IPFS({} as never, {} as never);
const nodes: Replica[] = [];
const pause = (milliseconds: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();

  setTimeout(resolve, milliseconds);

  return promise;
};
let stage = 'setup';
let root: string;

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

async function open(replica: Replica, gated: boolean): Promise<void> {
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
  const registry = new OrbitDBReplicatedStateRegistry();

  if (gated) registry.addMutationGate(new OrbitDBIdentityMutationGate(ipfs));
  replica.registry = registry;
  replica.index = new OrbitDBIdentityMetadataIndex(registry, ipfs);
  await registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
  await new OrbitDBIdentityMetadataProjection(registry, replica.index).start();
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
    ['second', true],
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
    const replica = { helia, name };

    nodes.push(replica);
    await open(replica, gated);
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
  for (const store of nodes.flatMap((replica) =>
    Object.values(replica.stores!),
  )) {
    assert.ok(store.sync, 'Real OrbitDB synchronization controls are required');
    await store.sync.start();
  }
}

/** Builds a self-signed identity whose id is the public key of `signer.id`. */
async function signedIdentity(
  signer: Signer,
  options: {
    handle?: string;
    previousCid?: string;
    timestamp: number;
    version: number;
  },
): Promise<Identity> {
  const deviceCredential = DeviceCredential.fromString(
    signer.device.toPrimitives().publicKey,
  );
  const unsigned: Omit<IdentityPrimitives, 'signature'> = {
    authorizationRevision: 0,
    deviceCredential: deviceCredential.valueOf(),
    deviceCredentialCommitment: deviceCredential.getCommitment().valueOf(),
    id: new IdentityId(signer.id.toPrimitives().publicKey).valueOf(),
    networks: [networkId],
    previousIdentityExternalIdentifier: options.previousCid,
    profile: new Profile(
      new ProfileName('Fixture'),
      undefined,
      undefined,
      undefined,
      options.handle ? new ProfileHandle(options.handle) : undefined,
    ).toPrimitives(),
    recoveryAuthority: signer.recovery.toPrimitives().publicKey,
    timestamp: options.timestamp,
    version: options.version,
  };
  const signature = await signer.id.sign(
    new IdentitySignatureDomainService().getCanonicalSigningContent(
      IdentitySignaturePayload.fromPrimitives(unsigned),
    ),
  );

  return Identity.fromPrimitives({
    ...unsigned,
    signature: signature.valueOf(),
  });
}

async function newSigner(): Promise<Signer> {
  return {
    device: await KeyPair.generate(),
    id: await KeyPair.generate(),
    recovery: await KeyPair.generate(),
  };
}

async function cidOf(identity: Identity): Promise<string> {
  return (await ipfs.calculateJSONId(mapper.toDocument(identity))).valueOf();
}

async function publish(replica: Replica, identity: Identity): Promise<string> {
  const cid = await cidOf(identity);

  await replica.index!.save(identity, new IdentityExternalIdentifier(cid));

  return cid;
}

/** The record shape the gate admits, with optional attacker overrides. */
function metadataDocument(
  identity: Identity,
  cid: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const primitives = identity.toPrimitives();
  const document: Record<string, unknown> = {
    cid,
    handle: primitives.profile.handle,
    id: cid,
    identity: primitives,
    identityId: primitives.id,
    networkIds: primitives.networks,
    previousCid: primitives.previousIdentityExternalIdentifier,
    version: primitives.version,
    ...overrides,
  };

  /** JSON round trip: IPLD cannot encode the `undefined` primitives. */
  return JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
}

async function versionsOf(
  replica: Replica,
  identityId: IdentityId,
): Promise<number[]> {
  const records = await replica.index!.findByIdentityId(identityId);

  return records.map((record) => record.version).sort();
}

async function handleOwners(
  replica: Replica,
  handle: string,
): Promise<string[]> {
  const records = await replica.index!.findByHandle(new ProfileHandle(handle));

  return records.map((record) => record.identityId);
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-identities-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  await startNodes();
  const [honest, second, malicious, control] = nodes;

  await connect();

  stage = 'signed identity replicates';
  const victimSigner = await newSigner();
  const victim = await signedIdentity(victimSigner, {
    handle: 'victim-handle',
    timestamp: 1_000,
    version: 1,
  });
  const victimId = new IdentityId(victim.toPrimitives().id);
  const firstCid = await publish(honest, victim);

  for (const replica of [second, control])
    await until(`${replica.name} receives the signed identity`, async () => {
      return (await versionsOf(replica, victimId)).join() === '1';
    });
  console.log('PASS self-signed identity replicated to gated and open nodes');

  stage = 'forged identities';
  const mallorySigner = await newSigner();
  const mallory = await signedIdentity(mallorySigner, {
    handle: 'mallory-handle',
    timestamp: 2_000,
    version: 1,
  });
  const malloryCid = await cidOf(mallory);
  const forgedVictimVersion = await signedIdentity(mallorySigner, {
    timestamp: 3_000,
    version: 99,
  });
  const referenceOnly = {
    cid: 'bafyforgedreferenceonly',
    id: 'bafyforgedreferenceonly',
    identityId: victimId.valueOf(),
    networkIds: [networkId],
    version: 99,
  };
  const forgedReceivedAt = metadataDocument(victim, firstCid, {
    id: 'forged-received-at',
    receivedAt: Date.now() + 1_000_000_000,
  });
  const tombstone = {
    cid: firstCid,
    deleted: true,
    id: 'forged-tombstone',
    identityId: victimId.valueOf(),
    version: 1,
  };
  const victimSlot = metadataDocument(mallory, malloryCid, {
    id: victimId.valueOf(),
    identityId: victimId.valueOf(),
  });
  const forgedOwnerDocument = metadataDocument(
    forgedVictimVersion,
    'bafyforgedownercid',
    { identityId: victimId.valueOf() },
  );

  for (const document of [
    referenceOnly,
    forgedReceivedAt,
    tombstone,
    victimSlot,
    forgedOwnerDocument,
  ])
    await malicious.stores!.identities.put!(document);
  await malicious.stores!.heads.put!(
    `identity:${victimId.valueOf()}`,
    metadataDocument(mallory, malloryCid),
  );
  await malicious.stores!.heads.put!(
    'identity-handle:victim-handle',
    metadataDocument(mallory, malloryCid),
  );

  await until('forged documents reached the honest raw store', async () => {
    const stored = await honest.stores!.identities.query!(
      (value) =>
        typeof value.id === 'string' &&
        [
          'bafyforgedreferenceonly',
          'forged-received-at',
          'forged-tombstone',
          victimId.valueOf(),
          'bafyforgedownercid',
        ].includes(value.id),
    );

    return stored.length === 5;
  });
  await pause(2000);
  for (const replica of [honest, second]) {
    assert.deepEqual(
      await versionsOf(replica, victimId),
      [1],
      `${replica.name} must only serve the self-signed victim identity`,
    );
    assert.deepEqual(
      await handleOwners(replica, 'victim-handle'),
      [victimId.valueOf()],
      `${replica.name} must keep the victim handle with the victim`,
    );
    assert.deepEqual(
      await handleOwners(replica, 'mallory-handle'),
      [],
      `${replica.name} must not project identities that arrived in forged slots`,
    );
    const head = await replica.registry!.findHead(
      `identity:${victimId.valueOf()}`,
    );

    assert.equal(
      head?.identityId,
      victimId.valueOf(),
      `${replica.name} must not cache a foreign record under the victim head`,
    );
    assert.equal(head?.cid, firstCid);
    assert.equal(
      (await replica.registry!.findHead('identity-handle:victim-handle'))
        ?.identityId,
      victimId.valueOf(),
      `${replica.name} must not cache a foreign record under the victim handle head`,
    );
  }
  console.log(
    'PASS reference-only, receivedAt, tombstone, victim-slot and head forgeries rejected',
  );

  stage = 'earliest signed handle claim wins';
  const lateSigner = await newSigner();
  const earlySigner = await newSigner();
  const lateClaim = await signedIdentity(lateSigner, {
    handle: 'contested-handle',
    timestamp: 6_000,
    version: 1,
  });
  const earlyClaim = await signedIdentity(earlySigner, {
    handle: 'contested-handle',
    timestamp: 5_000,
    version: 1,
  });
  const lateId = lateClaim.toPrimitives().id;
  const earlyId = earlyClaim.toPrimitives().id;

  await publish(malicious, lateClaim);
  for (const replica of [honest, second, control])
    await until(`${replica.name} sees the late claimant`, async () => {
      return (
        (await handleOwners(replica, 'contested-handle')).join() === lateId
      );
    });
  await publish(honest, earlyClaim);
  for (const replica of [honest, second, malicious, control])
    await until(`${replica.name} resolves the earliest claimant`, async () => {
      return (
        (await handleOwners(replica, 'contested-handle')).join() === earlyId
      );
    });
  assert.deepEqual(
    await versionsOf(second, new IdentityId(lateId)),
    [1],
    'The squatter keeps its own identity; only the handle is not its own',
  );
  console.log('PASS earliest-signed claimant owns the handle on every node');

  stage = 'valid successor converges after forgery';
  const successor = await signedIdentity(victimSigner, {
    handle: 'victim-handle',
    previousCid: firstCid,
    timestamp: 4_000,
    version: 2,
  });

  await publish(honest, successor);
  for (const replica of [second, control])
    await until(`${replica.name} converges on version 2`, async () => {
      return (await versionsOf(replica, victimId)).includes(2);
    });
  for (const replica of [honest, second])
    assert.deepEqual(
      await versionsOf(replica, victimId),
      [1, 2],
      `${replica.name} must hold exactly the signed chain`,
    );
  console.log(
    'PASS signed successor replicated; gated nodes hold only the signed chain',
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL forged identities deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged identities during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
