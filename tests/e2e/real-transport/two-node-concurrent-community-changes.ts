import 'reflect-metadata';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import CommunityOperationMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityOperationMutationPolicy';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationAuthorAuthorization } from '@app/contexts/public-mutations/domain/services/PublicMutationAuthorAuthorization';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
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
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

import {
  CommunityOperationSigner,
  signCommunityOperation,
  SignedCommunityOperation,
} from '../../support/signCommunityOperation';
import { teardownAndExit } from './RealTransportTeardown';

/**
 * haskou/pigeon-swarm#23: two real replicas, partitioned, each change a
 * community built on the same state. Once they reconnect, every independent
 * change must survive whichever of the two the fold applies last, removals
 * must stay removals and bans must keep the banned identity out.
 */

type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: { communityOperations: OrbitDBDatabase; heads: OrbitDBDatabase };
  repository?: OrbitDBCommunityRepository;
};

interface Change {
  action: CommunityOperationAction;
  args: Record<string, unknown>;
}

interface Fixture {
  bob: string;
  channelId: string;
  communityId: CommunityId;
  roleX: string;
  roleY: string;
}

interface Scenario {
  name: string;
  /** Applied on the first replica, before the partition. */
  prepare?: (fixture: Fixture) => Change[];
  /** Written by the first replica during the partition. */
  left: (fixture: Fixture) => Change;
  /** Written by the second replica during the partition. */
  right: (fixture: Fixture) => Change;
  expect: (community: Community, fixture: Fixture) => void;
}

/** Which of the two concurrent operations the fold applies last. */
type Last = 'left' | 'right';

type Case = { fixture: Fixture; last: Last; scenario: Scenario };

const networkId = randomUUID();
const nodes: Replica[] = [];
const authorized = new Set<string>();
const ledger: SignedCommunityOperation[] = [];
const authorization: PublicMutationAuthorAuthorization = {
  isAuthorized: (claimed) =>
    Promise.resolve(
      authorized.has(`${claimed.identityId}|${claimed.deviceCredential}`),
    ),
};
let clock = 1_780_000_000_000;
let stage = 'setup';
let root: string;
let owner: CommunityOperationSigner;

const PROFILE = { description: 'Original description', name: 'Original' };

async function until(
  label: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}

async function actor(): Promise<CommunityOperationSigner> {
  const deviceKeyPair = await KeyPair.generate();
  const deviceCredential = deviceKeyPair.toPrimitives().publicKey;
  const signer = {
    deviceCredential,
    deviceKeyPair,
    id: new IdentityId(deviceCredential).valueOf(),
  };

  authorized.add(`${signer.id}|${signer.deviceCredential}`);

  return signer;
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
    communityOperations: await replica.orbitdb.open(
      `${networkId}/communityOperations`,
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

  registry.addMutationGate(
    new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityOperationMutationPolicy(registry),
    ]),
  );
  replica.repository = new OrbitDBCommunityRepository(
    registry,
    new PrivateCommunityPublicStorageGuard(
      {
        hasScope: (): Promise<boolean> => Promise.resolve(false),
      } as never,
      new PrivateAuthorizationStorageCoordinator(),
    ),
  );
  await registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
}

async function synchronization(enabled: boolean): Promise<void> {
  for (const store of nodes.flatMap((replica) =>
    Object.values(replica.stores!),
  )) {
    assert.ok(store.sync, 'Real OrbitDB synchronization controls are required');
    await store.sync[enabled ? 'start' : 'stop']();
  }

  if (enabled) return;

  await Promise.all(
    nodes.flatMap((replica) =>
      replica.helia.libp2p
        .getConnections()
        .map((connection) => connection.close()),
    ),
  );
  await until('replicas disconnected for the partition', () =>
    Promise.resolve(
      nodes.every(
        (replica) => replica.helia.libp2p.getConnections().length === 0,
      ),
    ),
  );
}

async function connect(): Promise<void> {
  const [first, second] = nodes;
  const address = second.helia.libp2p
    .getMultiaddrs()
    .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));

  assert.ok(address, 'Each fixture peer must listen only on loopback');
  const target = await heliaRuntimeAdapter.createMultiaddr(address.toString());

  await until('replicas connect', async () => {
    try {
      await first.helia.libp2p.dial(target);

      return true;
    } catch {
      return false;
    }
  });
}

/** Every replica sees a head another one wrote after the redial. */
async function exchanged(): Promise<void> {
  const exchangeId = randomUUID();

  for (const [index, sender] of nodes.entries()) {
    const key = `fixture-exchange:${exchangeId}:${index}`;
    const sentinel = { id: key, nonce: randomUUID() };

    await sender.stores!.heads.put!(key, sentinel);
    await until(`heads of ${sender.name} exchanged`, async () => {
      for (const replica of nodes)
        if (!isDeepStrictEqual(await replica.stores!.heads.get!(key), sentinel))
          return false;

      return true;
    });
  }
}

function sign(
  id: CommunityId,
  change: Change,
  parents: string[],
  createdAt = clock++,
): SignedCommunityOperation {
  return signCommunityOperation({
    action: change.action.valueOf(),
    args: change.args,
    communityId: id.valueOf(),
    createdAt,
    networkId,
    parents,
    signer: owner,
  });
}

async function save(
  replica: Replica,
  signed: SignedCommunityOperation,
): Promise<void> {
  await replica.repository!.save(signed.operation, signed.proof);
  ledger.push(signed);
}

/** Folded state an honest replica must serve for the operations signed so far. */
function expectedOf(id: CommunityId) {
  return CommunityStateFold.fold(
    ledger
      .map((signed) => signed.operation)
      .filter((operation) => operation.getCommunityId().isEqual(id)),
  );
}

async function converged(label: string, id: CommunityId): Promise<Community> {
  const expected = expectedOf(id);

  assert.ok(expected.community, `${label}: the community must exist`);
  const primitives = JSON.parse(
    JSON.stringify(expected.community.toPrimitives()),
  );

  await until(label, async () => {
    for (const replica of nodes) {
      if (!(await replica.repository!.hasById(id))) return false;
      const community = await replica.repository!.requireById(id);

      if (
        !isDeepStrictEqual(
          JSON.parse(JSON.stringify(community.toPrimitives())),
          primitives,
        ) ||
        !isDeepStrictEqual(
          await replica.repository!.findFrontier(id),
          expected.frontier,
        )
      )
        return false;
    }

    return true;
  });

  return expected.community;
}

/**
 * Signs the two concurrent operations on the same parents and moves the
 * createdAt of one of them until its digest sorts after the other one: among
 * concurrent operations the fold applies the lowest digest first, so `last`
 * picks the change that is applied over the other.
 */
function concurrent(
  id: CommunityId,
  parents: string[],
  left: Change,
  right: Change,
  last: Last,
): [SignedCommunityOperation, SignedCommunityOperation] {
  const first = sign(id, last === 'left' ? right : left, parents);
  let second = sign(id, last === 'left' ? left : right, parents);

  while (second.operation.getHash() < first.operation.getHash())
    second = sign(id, last === 'left' ? left : right, parents);

  return last === 'left' ? [second, first] : [first, second];
}

const roleIds = (community: Community, member: string): string[] => {
  const assignment = community
    .toPrimitives()
    .memberRoles.find(
      (candidate: { identityId: string }) =>
        new IdentityId(candidate.identityId).valueOf() === member,
    );

  return [...(assignment?.roleIds ?? [])].sort();
};

const scenarios: Scenario[] = [
  {
    expect: (community, { bob }) => {
      assert.ok(
        community.isMember(new IdentityId(bob)),
        'The accepted member must survive the concurrent profile update',
      );
      assert.equal(
        community.toPrimitives().description,
        'Described concurrently',
      );
    },
    left: ({ bob }) => ({
      action: CommunityOperationAction.MEMBER_JOINED,
      args: { identityId: bob, method: 'added' },
    }),
    name: 'member acceptance and profile update',
    right: () => ({
      action: CommunityOperationAction.COMMUNITY_UPDATED,
      args: { ...PROFILE, description: 'Described concurrently' },
    }),
  },
  {
    expect: (community) => {
      const profile = community.toPrimitives();

      assert.equal(profile.name, 'Renamed concurrently');
      assert.equal(profile.description, 'Described concurrently');
    },
    left: () => ({
      action: CommunityOperationAction.COMMUNITY_UPDATED,
      args: { ...PROFILE, name: 'Renamed concurrently' },
    }),
    name: 'independent profile fields',
    right: () => ({
      action: CommunityOperationAction.COMMUNITY_UPDATED,
      args: { ...PROFILE, description: 'Described concurrently' },
    }),
  },
  {
    expect: (community, { bob, roleX, roleY }) =>
      assert.deepEqual(roleIds(community, bob), [roleX, roleY].sort()),
    left: ({ bob, roleX }) => ({
      action: CommunityOperationAction.MEMBER_ROLES_UPDATED,
      args: { identityId: bob, roleIds: [roleX] },
    }),
    name: 'two role grants to one member',
    prepare: ({ bob }) => [
      {
        action: CommunityOperationAction.MEMBER_JOINED,
        args: { identityId: bob, method: 'added' },
      },
    ],
    right: ({ bob, roleY }) => ({
      action: CommunityOperationAction.MEMBER_ROLES_UPDATED,
      args: { identityId: bob, roleIds: [roleY] },
    }),
  },
  {
    expect: (community, { bob, roleY }) =>
      assert.deepEqual(roleIds(community, bob), [roleY]),
    left: ({ bob }) => ({
      action: CommunityOperationAction.MEMBER_ROLES_UPDATED,
      args: { identityId: bob, roleIds: [] },
    }),
    name: 'role revocation and another role grant',
    prepare: ({ bob, roleX }) => [
      {
        action: CommunityOperationAction.MEMBER_JOINED,
        args: { identityId: bob, method: 'added' },
      },
      {
        action: CommunityOperationAction.MEMBER_ROLES_UPDATED,
        args: { identityId: bob, roleIds: [roleX] },
      },
    ],
    right: ({ bob, roleX, roleY }) => ({
      action: CommunityOperationAction.MEMBER_ROLES_UPDATED,
      args: { identityId: bob, roleIds: [roleX, roleY] },
    }),
  },
  {
    expect: (community, { channelId, roleX, roleY }) =>
      assert.deepEqual(
        community
          .getTextChannel(new CommunityChannelId(channelId))
          .getPermissions()
          .toPrimitives()
          .visibleRoleIds.slice()
          .sort(),
        [roleX, roleY].sort(),
      ),
    left: ({ channelId, roleX }) => ({
      action: CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED,
      args: { channelId, visibleRoleIds: [roleX] },
    }),
    name: 'two roles granted visibility of one channel',
    right: ({ channelId, roleY }) => ({
      action: CommunityOperationAction.CHANNEL_PERMISSIONS_UPDATED,
      args: { channelId, visibleRoleIds: [roleY] },
    }),
  },
  {
    expect: (community, { roleX }) => {
      const role = community.getRole(new CommunityRoleId(roleX)).toPrimitives();

      assert.equal(role.name, 'guardian');
      assert.deepEqual([...role.permissions].sort(), [
        'ban_members',
        'manage_messages',
      ]);
    },
    left: ({ roleX }) => ({
      action: CommunityOperationAction.ROLE_UPDATED,
      args: { name: 'guardian', permissions: ['ban_members'], roleId: roleX },
    }),
    name: 'role rename and role permission change',
    right: ({ roleX }) => ({
      action: CommunityOperationAction.ROLE_UPDATED,
      args: {
        name: 'moderator',
        permissions: ['ban_members', 'manage_messages'],
        roleId: roleX,
      },
    }),
  },
  {
    expect: (community, { bob }) => {
      const primitives = community.toPrimitives();

      assert.ok(!community.isMember(new IdentityId(bob)));
      assert.ok(
        primitives.bannedMemberIds.some(
          (banned: string) => new IdentityId(banned).valueOf() === bob,
        ),
        'The ban must hold against a concurrent role grant',
      );
      assert.deepEqual(roleIds(community, bob), []);
    },
    left: ({ bob }) => ({
      action: CommunityOperationAction.MEMBER_BANNED,
      args: { identityId: bob },
    }),
    name: 'ban and concurrent role grant',
    prepare: ({ bob }) => [
      {
        action: CommunityOperationAction.MEMBER_JOINED,
        args: { identityId: bob, method: 'added' },
      },
    ],
    right: ({ bob, roleX }) => ({
      action: CommunityOperationAction.MEMBER_ROLES_UPDATED,
      args: { identityId: bob, roleIds: [roleX] },
    }),
  },
];

/** Creates one community with two roles and a channel, on the first replica. */
async function community(bob: string): Promise<Fixture> {
  const [first] = nodes;
  const nonce = randomUUID();
  const communityId = CommunityId.derive(networkId, owner.id, nonce);
  const genesis = signCommunityOperation({
    action: CommunityOperationAction.COMMUNITY_CREATED.valueOf(),
    args: {
      autoJoinEnabled: false,
      discoverable: true,
      nonce,
      visibility: 'public',
      ...PROFILE,
    },
    communityId: communityId.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await save(first, genesis);
  const derived = async (
    name: CommunityOperationAction,
    derive: (at: number) => string,
    args: (id: string) => Record<string, unknown>,
  ): Promise<string> => {
    const createdAt = clock++;
    const id = derive(createdAt);

    await save(
      first,
      sign(
        communityId,
        { action: name, args: args(id) },
        await first.repository!.findFrontier(communityId),
        createdAt,
      ),
    );

    return id;
  };
  const role = (name: string) =>
    derived(
      CommunityOperationAction.ROLE_CREATED,
      (at) =>
        CommunityRoleId.derive(communityId.valueOf(), owner.id, at).valueOf(),
      (roleId) => ({ name, permissions: ['ban_members'], roleId }),
    );
  const roleX = await role('moderator');
  const roleY = await role('helper');
  const channelId = await derived(
    CommunityOperationAction.CHANNEL_CREATED,
    (at) =>
      CommunityChannelId.derive(communityId.valueOf(), owner.id, at).valueOf(),
    (id) => ({ channelId: id, name: 'general', type: 'text' }),
  );

  return { bob, channelId, communityId, roleX, roleY };
}

async function startNodes(): Promise<void> {
  const noop = (): void => undefined;

  new Kernel({ logger: { debug: noop, error: noop, info: noop, warn: noop } });
  const key = new PrivateKey(
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
      key,
      networkId,
    );
    const replica = { helia, name };

    nodes.push(replica);
    await open(replica);
  }
}

/** One community per scenario and ordering, so their DAGs stay independent. */
async function prepareCases(bob: string): Promise<Case[]> {
  const [first] = nodes;
  const cases: Case[] = [];

  for (const scenario of scenarios)
    for (const last of ['left', 'right'] as Last[]) {
      const fixture = await community(bob);

      for (const change of scenario.prepare?.(fixture) ?? [])
        await save(
          first,
          sign(
            fixture.communityId,
            change,
            await first.repository!.findFrontier(fixture.communityId),
          ),
        );
      cases.push({ fixture, last, scenario });
    }
  for (const { fixture, last, scenario } of cases)
    await converged(
      `${scenario.name} (${last} last) replicated before the partition`,
      fixture.communityId,
    );

  return cases;
}

async function changeConcurrently(cases: Case[]): Promise<void> {
  const [first, second] = nodes;

  await synchronization(false);
  for (const { fixture, last, scenario } of cases) {
    const parents = await first.repository!.findFrontier(fixture.communityId);

    assert.deepEqual(
      await second.repository!.findFrontier(fixture.communityId),
      parents,
      'Both replicas change the same state',
    );
    const [left, right] = concurrent(
      fixture.communityId,
      parents,
      scenario.left(fixture),
      scenario.right(fixture),
      last,
    );

    await save(first, left);
    await save(second, right);
  }
}

/** Returns one failure line per scenario whose merged state lost a change. */
async function verify(cases: Case[]): Promise<string[]> {
  const failures: string[] = [];

  for (const { fixture, last, scenario } of cases) {
    const label = `${scenario.name} (${last} applied last)`;

    stage = label;
    const folded = await converged(
      `${label} converged on both replicas`,
      fixture.communityId,
    );

    try {
      scenario.expect(folded, fixture);
      console.log(`PASS ${label}`);
    } catch (error) {
      failures.push(
        `FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return failures;
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-concurrent-communities-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  await startNodes();
  const [ownerSigner, bob] = await Promise.all([actor(), actor()]);

  owner = ownerSigner;
  await connect();
  await synchronization(true);

  stage = 'communities replicate before the partition';
  const cases = await prepareCases(bob.id);

  stage = 'concurrent changes during the partition';
  await changeConcurrently(cases);

  stage = 'partition heals';
  await connect();
  await synchronization(true);
  await exchanged();

  const failures = await verify(cases);

  stage = 'report';
  for (const failure of failures) console.error(failure);
  assert.equal(failures.length, 0, 'Concurrent community changes were lost');
  console.log(
    'PASS concurrent community changes survived replication between two real nodes',
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL concurrent community changes deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL concurrent community changes during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
