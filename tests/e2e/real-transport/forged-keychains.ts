import 'reflect-metadata';
import KeychainSignatureDomainService from '@app/contexts/keychains/domain/services/KeychainSignatureDomainService';
import { KeychainExternalIdentifier } from '@app/contexts/keychains/domain/value-objects/KeychainExternalIdentifier';
import IpfsKeychainMapper from '@app/contexts/keychains/infrastructure/ipfs/mappers/IpfsKeychainMapper';
import OrbitDBKeychainMetadataIndex from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataIndex';
import OrbitDBKeychainMetadataProjection from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMetadataProjection';
import { OrbitDBKeychainMutationGate } from '@app/contexts/keychains/infrastructure/orbitdb/OrbitDBKeychainMutationGate';
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
import Kernel from '@haskou/ddd-kernel';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { KeychainMother } from '../../unit/mothers/KeychainMother';
import { teardownAndExit } from './RealTransportTeardown';

type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: { heads: OrbitDBDatabase; keychains: OrbitDBDatabase };
  registry?: OrbitDBReplicatedStateRegistry;
  index?: OrbitDBKeychainMetadataIndex;
};

const networkId = randomUUID();
const mapper = new IpfsKeychainMapper();
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
    keychains: await replica.orbitdb.open(`${networkId}/keychains`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();

  if (gated)
    registry.addMutationGate(
      new OrbitDBKeychainMutationGate(
        new KeychainSignatureDomainService(),
        mapper,
        ipfs,
      ),
    );
  replica.registry = registry;
  replica.index = new OrbitDBKeychainMetadataIndex(registry);
  await registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
  await new OrbitDBKeychainMetadataProjection(registry, replica.index).start();
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

/** The CID Helia's JSON client assigns is the one the gate must recompute. */
async function publish(
  replica: Replica,
  mother: KeychainMother,
): Promise<string> {
  const keychain = mother.build();
  const document = mapper.toDocument(keychain);
  const client = await heliaRuntimeAdapter.createJSONClient(replica.helia);
  const cid = (await client.add(document)).toString();

  assert.equal(
    (await ipfs.calculateJSONId(document)).valueOf(),
    cid,
    'The gate must recompute the exact CID Helia assigns to the document',
  );
  await replica.index!.save(keychain, new KeychainExternalIdentifier(cid), [
    new NetworkId(networkId),
  ]);

  return cid;
}

function metadataDocument(
  mother: KeychainMother,
  cid: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const primitives = mother.primitives();

  return {
    cid,
    encryptedPayload: primitives.encryptedPayload,
    id: cid,
    networkIds: [networkId],
    ownerIdentityId: primitives.ownerIdentityId,
    receivedAt: Date.now() + 1_000_000,
    signature: primitives.signature,
    timestamp: primitives.timestamp,
    version: primitives.version,
    ...(primitives.previousKeychainExternalIdentifier
      ? { previousCid: primitives.previousKeychainExternalIdentifier }
      : {}),
    ...overrides,
  };
}

async function versionsOf(
  replica: Replica,
  owner: IdentityId,
): Promise<number[]> {
  const records = await replica.index!.findByOwnerIdentityId(owner);

  return records.map((record) => record.version).sort();
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-keychains-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  await startNodes();
  const [honest, second, malicious, control] = nodes;

  await connect();

  stage = 'signed keychain replicates';
  const victim = await KeychainMother.create();
  const victimId = victim.ownerIdentityId;
  const firstCid = await publish(honest, victim);

  for (const replica of [second, control])
    await until(`${replica.name} receives the signed keychain`, async () => {
      const versions = await versionsOf(replica, victimId);

      return versions.join() === '1';
    });
  console.log('PASS owner-signed keychain replicated to gated and open nodes');

  stage = 'forged keychains';
  const mallory = await KeychainMother.create();
  const forgedBadSignature = metadataDocument(
    victim,
    'bafyforgedbadsignature',
    {
      signature: mallory.signature().valueOf(),
      version: 99,
    },
  );
  const forgedForeignOwnerKeychain = await (async () => {
    const own = mallory.withVersion(98);
    const document = mapper.toDocument(own.build());
    const cid = (await ipfs.calculateJSONId(document)).valueOf();

    return { cid, record: metadataDocument(own, cid) };
  })();
  const forgedWrongCid = metadataDocument(
    victim.withVersion(97).withPreviousKeychainExternalIdentifier(firstCid),
    'bafyforgedwrongcid',
  );
  const forgedVictimVersions = [99, 97];

  victim.withVersion(1).withPreviousKeychainExternalIdentifier(undefined);
  await malicious.stores!.keychains.put!(forgedBadSignature);
  await malicious.stores!.keychains.put!(forgedForeignOwnerKeychain.record);
  await malicious.stores!.keychains.put!(forgedWrongCid);
  await malicious.stores!.heads.put!(
    `keychain:${victimId.valueOf()}`,
    forgedForeignOwnerKeychain.record,
  );
  await malicious.stores!.heads.put!(
    `keychain-cid:${firstCid}`,
    forgedBadSignature,
  );

  await until('forged keychains reached the open control node', async () => {
    const versions = await versionsOf(control, victimId);

    return forgedVictimVersions.every((version) => versions.includes(version));
  });
  console.log('INFO control node without the gate surfaced every forgery');

  await until('forged documents reached the honest raw store', async () => {
    const stored = await honest.stores!.keychains.query!(
      (value) => typeof value.version === 'number' && value.version > 1,
    );

    return stored.length === 3;
  });
  await pause(2000);
  for (const replica of [honest, second]) {
    assert.deepEqual(
      await versionsOf(replica, victimId),
      [1],
      `${replica.name} must only serve the owner-signed keychain`,
    );
    assert.equal(
      await replica.index!.findByExternalIdentifier(
        new KeychainExternalIdentifier('bafyforgedbadsignature'),
      ),
      undefined,
      `${replica.name} must not resolve a forged keychain cid`,
    );
    const head = await replica.registry!.findHead(
      `keychain:${victimId.valueOf()}`,
    );

    assert.equal(
      head?.ownerIdentityId,
      victimId.valueOf(),
      `${replica.name} must not cache a foreign record under the victim head`,
    );
    assert.equal(head?.cid, firstCid);
  }
  console.log('PASS forged keychain documents and heads rejected');

  stage = 'valid successor converges after forgery';
  victim.withVersion(2).withPreviousKeychainExternalIdentifier(firstCid);
  await publish(honest, victim);
  for (const replica of [second, control])
    await until(`${replica.name} converges on version 2`, async () => {
      const records = await replica.index!.findByOwnerIdentityId(victimId);

      return records.some((record) => record.version === 2);
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
  console.error(`FAIL forged keychains deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged keychains during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
