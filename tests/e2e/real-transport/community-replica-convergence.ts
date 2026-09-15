import OrbitDBCommunityReplicaMerger from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityReplicaMerger';
import OrbitDBCommunityReplicaProjection from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityReplicaProjection';
import 'reflect-metadata';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityRole } from '@app/contexts/communities/domain/entities/membership/CommunityRole';
import { CommunityName } from '@app/contexts/communities/domain/value-objects/CommunityName';
import { CommunityDescription } from '@app/contexts/communities/domain/value-objects/CommunityDescription';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import OrbitDBCommunityMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityMapper';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { PrivateKey } from '@haskou/pigeon-swarm-crypto';
import Kernel from '@haskou/ddd-kernel';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: { communities: OrbitDBDatabase; heads: OrbitDBDatabase };
  registry?: OrbitDBReplicatedStateRegistry;
  repository?: OrbitDBCommunityRepository;
};

const networkId = randomUUID();
const mapper = new OrbitDBCommunityMapper();
const nodes: Replica[] = [];
const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let stage = 'setup';
let root: string;

function identity(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64'),
  );
}

async function until(
  label: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await pause(100);
  }
  throw new Error(`Timed out: ${label}`);
}

function canonical(community: Community): unknown {
  const value = JSON.parse(JSON.stringify(community.toPrimitives()));
  value.memberIds.sort();
  value.bannedMemberIds.sort();
  value.memberRoles.sort(
    (left: { identityId: string }, right: { identityId: string }) =>
      left.identityId.localeCompare(right.identityId),
  );
  return value;
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
    communities: await replica.orbitdb.open(`${networkId}/communities`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      type: 'documents',
      sync: false,
    }),
    heads: await replica.orbitdb.open(`${networkId}/heads`, {
      AccessController,
      type: 'keyvalue',
      sync: false,
    }),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  replica.registry = new OrbitDBReplicatedStateRegistry();
  replica.repository = new OrbitDBCommunityRepository(
    replica.registry,
    mapper,
    new OrbitDBCommunityReplicaMerger(),
    new OrbitDBCommunityReplicaProjection(
      replica.registry,
      new OrbitDBCommunityReplicaMerger(),
    ),
  );
  await replica.registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
}

async function synchronization(
  enabled: boolean,
  replicas = nodes,
): Promise<void> {
  for (const replica of replicas)
    for (const store of Object.values(replica.stores!)) {
      assert.ok(
        store.sync,
        'Real OrbitDB synchronization controls are required',
      );
      await store.sync[enabled ? 'start' : 'stop']();
    }
  if (!enabled) {
    for (const replica of replicas) {
      for (const connection of replica.helia.libp2p.getConnections()) {
        await connection.close();
      }
    }
    await until('private connections closed for partition', async () =>
      replicas.every(
        (replica) => replica.helia.libp2p.getConnections().length === 0,
      ),
    );
  }
}

async function exchanged(replicas: Replica[]): Promise<void> {
  await until('actual OrbitDB heads exchanged after redial', async () => {
    for (const storeName of ['communities', 'heads'] as const) {
      const signatures = await Promise.all(
        replicas.map(async (replica) => {
          const store = replica.stores![storeName];
          return (await store.log!.heads())
            .map((entry) => entry.hash)
            .sort()
            .join(',');
        }),
      );
      if (!signatures.every(Boolean) || new Set(signatures).size !== 1)
        return false;
    }
    return true;
  });
  console.log(`PASS actual OrbitDB head exchange: ${replicas.length} replicas`);
}

async function freshSynchronizationSentinel(): Promise<void> {
  const key = `fixture-sync:${randomUUID()}`;
  const sentinel = { nonce: randomUUID() };
  await nodes[0].stores!.heads.put!(key, sentinel);
  await until(
    'fresh sentinel received after repeated synchronization',
    async () => {
      const received = await Promise.all(
        nodes.map((node) => node.stores!.heads.get!(key)),
      );
      return received.every((value) => isDeepStrictEqual(value, sentinel));
    },
  );
  console.log('PASS fresh persisted synchronization sentinel: 3 replicas');
}

async function connect(replicas: Replica[]): Promise<void> {
  for (let index = 0; index < replicas.length; index++)
    for (let other = index + 1; other < replicas.length; other++) {
      const address = replicas[other].helia.libp2p
        .getMultiaddrs()
        .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));
      assert.ok(address, 'Each fixture peer must listen only on loopback');
      const target = await heliaRuntimeAdapter.createMultiaddr(address.toString());
      let lastError: unknown;
      try {
        await until('fixture peers reconnect after connection shutdown', async () => {
          try {
            await replicas[index].helia.libp2p.dial(target);
            return true;
          } catch (error) {
            lastError = error;
            return false;
          }
        });
      } catch {
        throw new Error(`Fixture reconnection failed: ${String(lastError)}`);
      }
    }
}

async function save(replica: Replica, community: Community): Promise<void> {
  const before = (await replica.stores!.communities.log!.heads())
    .map((entry) => entry.hash)
    .join();
  await replica.repository!.save(community);
  await until(
    'local community persisted',
    async () =>
      (await replica.stores!.communities.log!.heads())
        .map((entry) => entry.hash)
        .join() !== before,
  );
  await until('local head persisted', async () => {
    const stored = await replica.registry!.findPersistedHead(
      `community:${community.getId().valueOf()}`,
    );
    return Boolean(stored && stored.name === community.toPrimitives().name);
  });
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-community-convergence-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  const noop = (): void => undefined;
  new Kernel({ logger: { debug: noop, info: noop, warn: noop, error: noop } });
  const key = new PrivateKey(
    generateKeyPairSync('ed25519')
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString(),
  );
  for (const name of ['a', 'b', 'c']) {
    const helia = await HeliaIPFS.createPrivateHeliaCore(
      {
        storageLocation: path.join(root, name, 'ipfs'),
        listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
        localPeerDiscoveryEnabled: false,
        publicRelayDiscoveryEnabled: false,
        distributedHashTableEnabled: false,
        contentRoutingEnabled: false,
        manualRelayMultiaddrs: [],
      },
      key,
      networkId,
    );
    const replica = { name, helia };
    nodes.push(replica);
    await open(replica);
  }
  assert.equal(
    new Set(nodes.map((node) => node.stores!.communities.address)).size,
    1,
  );
  assert.equal(
    new Set(nodes.map((node) => node.helia.libp2p.peerId.toString())).size,
    3,
  );
  const [owner, first, second] = [identity(), identity(), identity()];
  const base = Community.fromPrimitives({
    id: randomUUID(),
    networkId,
    ownerIdentityId: owner.valueOf(),
    name: 'Initial community',
    description: 'Initial description',
    memberIds: [owner.valueOf()],
    bannedMemberIds: [],
    memberRoles: [],
    roles: [CommunityRole.everyone().toPrimitives()],
    textChannels: [],
    voiceChannels: [],
    visibility: 'private',
    autoJoinEnabled: false,
    discoverable: false,
    createdAt: Date.now(),
    avatar: undefined,
    banner: undefined,
  });
  const id = base.getId();
  const load = async (node: Replica): Promise<Community> => {
    const community = await node.repository!.findById(id);
    assert.ok(community, 'Community must exist in each independent registry');
    return community;
  };
  const converged = async (
    expected: Community,
    replicas = nodes,
  ): Promise<void> =>
    until(stage, async () => {
      const values = await Promise.all(
        replicas.map((node) => node.repository!.findById(id)),
      );
      if (
        !values.every(
          (value) =>
            value && isDeepStrictEqual(canonical(value), canonical(expected)),
        )
      )
        return false;
      for (const node of replicas)
        for (const member of [owner, first, second]) {
          const indexed = (await node.repository!.findByMember(member)).filter(
            (community) => community.getId().isEqual(id),
          );
          if (!expected.isMember(member)) {
            if (indexed.length) return false;
          } else if (
            indexed.length !== 1 ||
            !isDeepStrictEqual(canonical(indexed[0]), canonical(expected))
          )
            return false;
        }
      return true;
    });
  await connect(nodes);
  await synchronization(true);
  await save(nodes[0], base);
  stage = 'initial complete document replication';
  await converged(base);
  await synchronization(false);
  const branches = await Promise.all(nodes.map(load));
  branches[0].addMember(owner, first);
  branches[1].addMember(owner, second);
  branches[2].updateProfile(
    owner,
    new CommunityName('Concurrent profile'),
    new CommunityDescription('Concurrent description'),
  );
  await Promise.all(nodes.map((node, index) => save(node, branches[index])));
  for (let index = 0; index < nodes.length; index++)
    assert.deepEqual(
      canonical(await load(nodes[index])),
      canonical(branches[index]),
      'Paused replication must preserve genuinely independent branches',
    );
  const expected = Community.fromPrimitives(base.toPrimitives());
  expected.addMember(owner, first);
  expected.addMember(owner, second);
  expected.updateProfile(
    owner,
    new CommunityName('Concurrent profile'),
    new CommunityDescription('Concurrent description'),
  );
  stage = 'concurrent additions and profile convergence';
  await synchronization(true, nodes.slice(0, 2));
  await connect(nodes.slice(0, 2));
  await exchanged(nodes.slice(0, 2));
  await until('first two replicas preserve both additions', async () =>
    (await Promise.all(nodes.slice(0, 2).map(load))).every(
      (community) => community.isMember(first) && community.isMember(second),
    ),
  );
  assert.deepEqual(
    canonical(await load(nodes[2])),
    canonical(branches[2]),
    'Delayed replica must remain independent until synchronization resumes',
  );
  await synchronization(true, [nodes[2]]);
  await connect(nodes);
  await exchanged(nodes);
  await converged(expected);
  await synchronization(false);
  const removal = await load(nodes[0]);
  const staleEdit = await load(nodes[1]);
  removal.kickMember(owner, first);
  staleEdit.updateProfile(
    owner,
    new CommunityName('After removal'),
    new CommunityDescription('Stale unrelated edit'),
  );
  await save(nodes[0], removal);
  await save(nodes[1], staleEdit);
  expected.kickMember(owner, first);
  expected.updateProfile(
    owner,
    new CommunityName('After removal'),
    new CommunityDescription('Stale unrelated edit'),
  );
  stage = 'explicit removal survives stale unrelated edit';
  await synchronization(true);
  await connect(nodes);
  await exchanged(nodes);
  await converged(expected);
  stage = 'repeated persisted log synchronization';
  await synchronization(false);
  await synchronization(true);
  await connect(nodes);
  await freshSynchronizationSentinel();
  await converged(expected);
  stage = 'fresh registry and OrbitDB reload';
  const restarted = nodes[2];
  await synchronization(false, [restarted]);
  restarted.registry!.clear();
  await restarted.orbitdb!.stop();
  restarted.orbitdb = undefined;
  stage = 'opening persisted OrbitDB stores';
  await open(restarted);
  stage = 'cold community reconstruction before reconnect';
  await converged(expected, [restarted]);
  stage = 'reconnecting restarted replica';
  await synchronization(true, [restarted]);
  await connect(nodes);
  await converged(expected);
  console.log(
    'PASS community convergence: three real private Helia/OrbitDB instances; partitioned additions and profile; delayed replica; explicit removal; repeated synchronization; fresh registry/store reload. One process, independent storage and caches; no external NAT claim.',
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL community convergence deadline during ${stage}`);
  process.exit(1);
}, 180000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`FAIL community convergence during ${stage}`);
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
      if (root) await rm(root, { recursive: true, force: true });
    } finally {
      clearTimeout(watchdog);
    }
  });
