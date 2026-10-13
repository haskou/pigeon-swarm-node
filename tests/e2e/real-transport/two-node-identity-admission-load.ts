import 'reflect-metadata';
import IdentityAdmissionObserver from '@app/contexts/identities/application/observe-admission/IdentityAdmissionObserver';
import { IdentityAdmissionObservationMessage } from '@app/contexts/identities/application/observe-admission/messages/IdentityAdmissionObservationMessage';
import { IdentitySignatureDomainService } from '@app/contexts/identities/domain/domain-services/IdentitySignatureDomainService';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import { IdentitySignaturePayload } from '@app/contexts/identities/domain/IdentitySignaturePayload';
import { Profile } from '@app/contexts/identities/domain/Profile';
import IdentityAdmissionPricingDomainService from '@app/contexts/identities/domain/services/IdentityAdmissionPricingDomainService';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityAdmissionDifficulty } from '@app/contexts/identities/domain/value-objects/IdentityAdmissionDifficulty';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { ProfileName } from '@app/contexts/identities/domain/value-objects/ProfileName';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import LocalIdentityAdmissionLoadRepository from '@app/contexts/identities/infrastructure/local-db/LocalIdentityAdmissionLoadRepository';
import OrbitDBIdentityAdmissionObservationProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityAdmissionObservationProjection';
import OrbitDBIdentityMetadataIndex from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataIndex';
import OrbitDBIdentityMetadataProjection from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMetadataProjection';
import { OrbitDBIdentityMutationGate } from '@app/contexts/identities/infrastructure/orbitdb/OrbitDBIdentityMutationGate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
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
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import Kernel from '@haskou/ddd-kernel';
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { teardownAndExit } from './RealTransportTeardown';
import { mineAdmissionNonce } from '../../support/mineAdmissionNonce';

/**
 * Node `admitting` saves identity admissions into a network over real libp2p
 * and OrbitDB replication; node `observing` never admits anything itself, yet
 * must price its own admissions into that network from the replicated rate.
 * Stale admissions and admissions that paid less than the observing node asks
 * must not raise its price.
 */
type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: { heads: OrbitDBDatabase; identities: OrbitDBDatabase };
  registry?: OrbitDBReplicatedStateRegistry;
  index?: OrbitDBIdentityMetadataIndex;
};

/** Records which versions the projection handed over, so the script waits for them instead of sleeping. */
class TrackingObserver extends IdentityAdmissionObserver {
  public readonly handled = new Set<string>();

  public override async observe(
    message: IdentityAdmissionObservationMessage,
  ): Promise<void> {
    await super.observe(message);
    this.handled.add(message.externalIdentifier.valueOf());
  }
}

const FREE = IdentityAdmissionDifficulty.FREE_ADMISSIONS_PER_WINDOW;
const FLOOR_BITS = IdentityAdmissionDifficulty.floor().valueOf();
const networkId = randomUUID();
const network = new NetworkId(networkId);
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
  condition: () => Promise<boolean> | boolean,
): Promise<void> {
  const deadline = Date.now() + 30000;
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
  const registry = new OrbitDBReplicatedStateRegistry();

  registry.addMutationGate(new OrbitDBIdentityMutationGate(ipfs));
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

  for (const name of ['admitting', 'observing']) {
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
    await open(replica);
  }
}

async function connect(): Promise<void> {
  const [admitting, observing] = nodes;
  const address = observing.helia.libp2p
    .getMultiaddrs()
    .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));

  assert.ok(address, 'Each fixture peer must listen only on loopback');
  const target = await heliaRuntimeAdapter.createMultiaddr(address.toString());

  await until('fixture peers connect', async () => {
    try {
      await admitting.helia.libp2p.dial(target);

      return true;
    } catch {
      return false;
    }
  });
  for (const store of nodes.flatMap((replica) =>
    Object.values(replica.stores!),
  )) {
    assert.ok(store.sync, 'Real OrbitDB synchronization controls are required');
    await store.sync.start();
  }
}

/** A self-signed genesis admission into the network whose proof meets exactly `bits`. */
async function admission(timestamp: number, bits: number): Promise<Identity> {
  const signer = {
    device: await KeyPair.generate(),
    id: await KeyPair.generate(),
    recovery: await KeyPair.generate(),
  };
  const deviceCredential = DeviceCredential.fromString(
    signer.device.toPrimitives().publicKey,
  );
  const identityId = new IdentityId(
    signer.id.toPrimitives().publicKey,
  ).valueOf();
  const unsigned: Omit<IdentityPrimitives, 'signature'> = {
    admissionNonce: mineAdmissionNonce(identityId, [networkId], bits),
    authorizationRevision: 0,
    deviceCredential: deviceCredential.valueOf(),
    deviceCredentialCommitment: deviceCredential.getCommitment().valueOf(),
    id: identityId,
    networks: [networkId],
    profile: new Profile(new ProfileName('Fixture')).toPrimitives(),
    recoveryAuthority: signer.recovery.toPrimitives().publicKey,
    timestamp,
    version: 1,
  };
  const signature = await signer.id.sign(
    new IdentitySignatureDomainService().getCanonicalSigningContent(
      IdentitySignaturePayload.fromPrimitives(unsigned),
    ),
  );

  return Identity.fromPrimitives({ ...unsigned, signature: signature.valueOf() });
}

async function admissions(
  count: number,
  timestamp: number,
  bits: number,
): Promise<Identity[]> {
  const built: Identity[] = [];

  for (let index = 0; index < count; index++)
    built.push(await admission(timestamp, bits));

  return built;
}

/** Saves the admissions on `replica` one by one and returns their cids. */
async function admit(
  replica: Replica,
  identities: Identity[],
): Promise<string[]> {
  const cids: string[] = [];

  for (const identity of identities) {
    const cid = (
      await ipfs.calculateJSONId(mapper.toDocument(identity))
    ).valueOf();

    await replica.index!.save(identity, new IdentityExternalIdentifier(cid));
    cids.push(cid);
  }

  return cids;
}

async function holdsAll(
  replica: Replica,
  identities: Identity[],
): Promise<boolean> {
  for (const identity of identities) {
    const records = await replica.index!.findByIdentityId(
      new IdentityId(identity.toPrimitives().id),
    );

    if (records.length === 0) return false;
  }

  return true;
}

async function main(): Promise<void> {
  root = await mkdtemp(
    path.join(tmpdir(), 'pigeon-two-node-identity-admission-load-'),
  );
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  process.env.PIGEON_LOCAL_DB_PATH = path.join(root, 'observing', 'local-db');
  await startNodes();
  const [admitting, observing] = nodes;
  const load = new LocalIdentityAdmissionLoadRepository(
    new EmbeddedLocalDatabase(),
  );
  const pricing = new IdentityAdmissionPricingDomainService(load);
  const observer = new TrackingObserver(pricing);

  await new OrbitDBIdentityAdmissionObservationProjection(
    observing.registry!,
    observing.index!,
    observer,
  ).start();
  await connect();

  // Mined up front so the whole flood replicates inside one counting window.
  stage = 'mining admissions';
  const now = Date.now();
  const stale = await admissions(
    5,
    now - 2 * IdentityAdmissionDifficulty.FRESHNESS_HORIZON_MS,
    FLOOR_BITS,
  );
  const flood = await admissions(FREE, now, FLOOR_BITS);
  const underpaid = await admissions(10, now, FLOOR_BITS);
  const [paid] = await admissions(1, now, FLOOR_BITS + 1);
  const probe = await admission(now, FLOOR_BITS);

  stage = 'stale admissions replicate';
  await admit(admitting, stale);
  await until('observing holds the stale admissions', () =>
    holdsAll(observing, stale),
  );
  assert.equal(
    await load.countRecent(network),
    0,
    'Stale admissions must not count as network load',
  );
  assert.equal(
    (await pricing.requiredFor(probe, [network])).valueOf(),
    FLOOR_BITS,
  );
  console.log('PASS replicated stale admissions leave the price at the floor');

  stage = 'admission flood replicates';
  const floodCids = await admit(admitting, flood);
  await until('observing counts the replicated flood', () =>
    floodCids.every((cid) => observer.handled.has(cid)),
  );
  assert.equal(await load.countRecent(network), FREE);
  assert.equal(
    (await pricing.requiredFor(probe, [network])).valueOf(),
    FLOOR_BITS + 1,
    'A node that admitted nothing itself must price from the replicated rate',
  );
  console.log(
    `PASS ${FREE} admissions on another node raise the observing node's price`,
  );

  stage = 'underpaid admissions replicate';
  const underpaidCids = await admit(admitting, underpaid);
  await until('observing handles the underpaid admissions', () =>
    underpaidCids.every((cid) => observer.handled.has(cid)),
  );
  assert.equal(
    await load.countRecent(network),
    FREE,
    'Admissions below the observed price must not raise it further',
  );
  console.log('PASS admissions below the observed price are not counted');

  stage = 'paid admission replicates';
  const [paidCid] = await admit(admitting, [paid]);
  await until('observing handles the paid admission', () =>
    observer.handled.has(paidCid),
  );
  assert.equal(await load.countRecent(network), FREE + 1);
  console.log('PASS an admission paying the observed price is counted');
}

const watchdog = setTimeout(() => {
  console.error(`FAIL two-node identity admission load deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL two-node identity admission load during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
