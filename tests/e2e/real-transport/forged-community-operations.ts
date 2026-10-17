import 'reflect-metadata';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import OrbitDBCommunityInvitationClaimRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityInvitationClaimRepository';
import OrbitDBCommunityRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityRepository';
import CommunityInvitationClaimMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInvitationClaimMutationPolicy';
import CommunityOperationMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityOperationMutationPolicy';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
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
import {
  CommunityInvitationKey,
  KeyPair,
  PrivateKey,
} from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  invitationFieldsOf,
  signInvitationClaim,
  signInvitationProofs,
} from '../../support/signCommunityInvitation';
import {
  CommunityOperationSigner,
  signCommunityOperation,
  signCommunityOperationRecord,
  SignedCommunityOperation,
} from '../../support/signCommunityOperation';
import { teardownAndExit } from './RealTransportTeardown';

type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: {
    communityOperations: OrbitDBDatabase;
    heads: OrbitDBDatabase;
    requests: OrbitDBDatabase;
  };
  registry?: OrbitDBReplicatedStateRegistry;
  repository?: OrbitDBCommunityRepository;
  claims?: OrbitDBCommunityInvitationClaimRepository;
};

const action = (name: keyof typeof CommunityOperationAction & string): string =>
  (
    CommunityOperationAction[name] as unknown as { valueOf(): string }
  ).valueOf();

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
const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
let clock = 1_780_000_000_000;
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

async function actor(): Promise<CommunityOperationSigner> {
  const deviceKeyPair = await KeyPair.generate();
  const deviceCredential = deviceKeyPair.toPrimitives().publicKey;
  const signer = {
    deviceCredential,
    deviceKeyPair,
    id: new IdentityId(deviceCredential).valueOf(),
    identityKeyPair: deviceKeyPair,
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
    requests: await replica.orbitdb.open(`${networkId}/requests`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();
  const guard = new PrivateCommunityPublicStorageGuard(
    {
      hasScope: (): Promise<boolean> => Promise.resolve(false),
    } as never,
    new PrivateAuthorizationStorageCoordinator(),
  );
  const repository = new OrbitDBCommunityRepository(registry, guard);

  registry.addMutationGate(
    new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityOperationMutationPolicy(),
      new CommunityInvitationClaimMutationPolicy(repository, registry),
    ]),
  );
  replica.registry = registry;
  replica.repository = repository;
  replica.claims = new OrbitDBCommunityInvitationClaimRepository(
    registry,
    guard,
  );
  await registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
}

async function disconnected(replicas: Replica[]): Promise<void> {
  await Promise.all(
    replicas.flatMap((replica) =>
      replica.helia.libp2p
        .getConnections()
        .map((connection) => connection.close()),
    ),
  );
  await until('private connections closed for partition', () =>
    Promise.resolve(
      replicas.every(
        (replica) => replica.helia.libp2p.getConnections().length === 0,
      ),
    ),
  );
}

async function synchronization(
  enabled: boolean,
  replicas = nodes,
): Promise<void> {
  for (const store of replicas.flatMap((replica) =>
    Object.values(replica.stores!),
  )) {
    assert.ok(store.sync, 'Real OrbitDB synchronization controls are required');
    await store.sync[enabled ? 'start' : 'stop']();
  }

  if (!enabled) await disconnected(replicas);
}

async function connect(replicas = nodes): Promise<void> {
  for (let index = 0; index < replicas.length; index++)
    for (let other = index + 1; other < replicas.length; other++) {
      const address = replicas[other].helia.libp2p
        .getMultiaddrs()
        .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));

      assert.ok(address, 'Each fixture peer must listen only on loopback');
      const target = await heliaRuntimeAdapter.createMultiaddr(
        address.toString(),
      );

      await until('fixture peers reconnect', async () => {
        try {
          await replicas[index].helia.libp2p.dial(target);

          return true;
        } catch {
          return false;
        }
      });
    }
}

/** Every replica sees a head another one wrote after the redial. */
async function exchanged(replicas = nodes): Promise<void> {
  const exchangeId = randomUUID();

  for (const [index, sender] of replicas.entries()) {
    const key = `fixture-exchange:${exchangeId}:${index}`;
    const sentinel = { id: key, nonce: randomUUID() };

    await sender.stores!.heads.put!(key, sentinel);
    await until(`heads of ${sender.name} exchanged after redial`, async () => {
      for (const replica of replicas)
        if (!isDeepStrictEqual(await replica.stores!.heads.get!(key), sentinel))
          return false;

      return true;
    });
  }
}

/** What an honest replica must serve: the fold of the operations signed so far. */
function expectedOf(operations: SignedCommunityOperation[], id: CommunityId) {
  return CommunityStateFold.fold(
    operations
      .map((signed) => signed.operation)
      .filter((operation) => operation.getCommunityId().isEqual(id)),
  );
}

async function converged(
  label: string,
  id: CommunityId,
  replicas = nodes,
  operations = ledger,
): Promise<void> {
  const expected = expectedOf(operations, id);

  const observed: string[] = [];

  try {
    await until(label, async () => {
      observed.length = 0;
      for (const replica of replicas) {
        const community = (await replica.repository!.hasById(id))
          ? await replica.repository!.requireById(id)
          : undefined;
        const frontier = await replica.repository!.findFrontier(id);

        observed.push(`${replica.name}: frontier=${frontier.join(',')}`);

        if (expected.deleted || !expected.community) {
          if (community) return false;
        } else if (
          !community ||
          !isDeepStrictEqual(
            JSON.parse(JSON.stringify(community.toPrimitives())),
            JSON.parse(JSON.stringify(expected.community.toPrimitives())),
          )
        )
          return false;

        if (!isDeepStrictEqual(frontier, expected.frontier)) return false;
      }

      return true;
    });
  } catch (error) {
    console.error(`expected frontier=${expected.frontier.join(',')}`);
    console.error(observed.join('\n'));
    throw error;
  }
}

async function submit(
  replica: Replica,
  id: CommunityId,
  signer: CommunityOperationSigner,
  name: Parameters<typeof action>[0],
  args: Record<string, unknown>,
): Promise<SignedCommunityOperation> {
  const signed = signCommunityOperation({
    action: action(name),
    args,
    communityId: id.valueOf(),
    createdAt: clock++,
    networkId,
    parents: await replica.repository!.findFrontier(id),
    signer,
  });

  await replica.repository!.save(signed.operation, signed.proof);
  ledger.push(signed);

  return signed;
}

function record(signed: SignedCommunityOperation): Record<string, unknown> {
  return PublicMutationRecord.withProof(
    { ...signed.operation.toPrimitives() },
    signed.proof,
  );
}

async function assertHeadsIndexOnlySignedOperations(
  communityId: CommunityId,
): Promise<void> {
  const legitimateIds = new Set(
    ledger
      .filter((signed) =>
        signed.operation.getCommunityId().isEqual(communityId),
      )
      .map((signed) => signed.operation.getId()),
  );

  for (const replica of nodes) {
    const head = (await replica.registry!.findHead(
      `community-operation-index:${communityId.valueOf()}`,
    )) as { communityOperations: { id: string }[] };

    assert.deepEqual(
      head.communityOperations
        .map((operation) => operation.id)
        .filter((id) => !legitimateIds.has(id)),
      [],
      `${replica.name} must not index a forged record in its head`,
    );
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

  for (const name of ['honest', 'second', 'malicious']) {
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

const HOUR = 3_600_000;

function aliasOf(identityId: string): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const index = identityId.length - 2;
  const value = alphabet.indexOf(identityId[index]);
  const padding = value % 4;

  return `${identityId.slice(0, index)}${alphabet[value - padding + ((padding + 1) % 4)]}${identityId.slice(index + 1)}`;
}

/** What every replica serves about the invitations of a community. */
async function invitationsOf(
  replica: Replica,
  id: CommunityId,
): Promise<unknown> {
  const community = await replica.repository!.requireById(id);

  return JSON.parse(
    JSON.stringify(
      (await replica.repository!.findInvitations(id))
        .list()
        .map((invitation) => invitation.toPrimitives(community))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
  );
}

async function invitationsConverged(
  label: string,
  id: CommunityId,
): Promise<void> {
  const expected = expectedOf(ledger, id);
  const wanted = JSON.parse(
    JSON.stringify(
      expected.invitations
        .list()
        .map((invitation) => invitation.toPrimitives(expected.community!))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ),
  );

  await converged(label, id);
  await until(`${label}: invitations`, async () => {
    for (const replica of nodes)
      if (!isDeepStrictEqual(await invitationsOf(replica, id), wanted))
        return false;

    return true;
  });
}

/** Writes one operation and waits until every replica folds it, so no step is judged before its parents arrive. */
async function send(
  ...[replica, id, signer, name, args]: Parameters<typeof submit>
): Promise<SignedCommunityOperation> {
  const signed = await submit(replica, id, signer, name, args);

  await converged('invitation step reached every replica', id);

  return signed;
}

async function forgedInvitations(owner: CommunityOperationSigner) {
  const [honest, second, malicious] = nodes;
  const [manager, issuer, plain, joiner] = await Promise.all(
    Array.from({ length: 4 }, () => actor()),
  );
  const nonce = randomUUID();
  const id = CommunityId.derive(networkId, owner.id, nonce);
  const genesis = signCommunityOperation({
    action: action('COMMUNITY_CREATED'),
    args: {
      autoJoinEnabled: false,
      description: 'Invitation target',
      discoverable: true,
      name: 'Invitations',
      nonce,
      visibility: 'public',
    },
    communityId: id.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await honest.repository!.save(genesis.operation, genesis.proof);
  ledger.push(genesis);
  await converged('invitation genesis reached every replica', id);
  for (const member of [manager, issuer, plain]) {
    await submit(second, id, owner, 'MEMBER_JOINED', {
      identityId: member.id,
      method: 'added',
    });
    await converged('invitation member reached every replica', id);
  }
  const managers = CommunityRoleId.derive(
    id.valueOf(),
    owner.id,
    clock,
  ).valueOf();

  await send(honest, id, owner, 'ROLE_CREATED', {
    name: 'managers',
    permissions: ['create_invites', 'manage_members'],
    roleId: managers,
  });
  const issuers = CommunityRoleId.derive(
    id.valueOf(),
    owner.id,
    clock,
  ).valueOf();

  await send(honest, id, owner, 'ROLE_CREATED', {
    name: 'issuers',
    permissions: ['create_invites'],
    roleId: issuers,
  });
  await send(honest, id, owner, 'MEMBER_ROLES_UPDATED', {
    identityId: manager.id,
    roleIds: [managers],
  });
  await send(honest, id, owner, 'MEMBER_ROLES_UPDATED', {
    identityId: issuer.id,
    roleIds: [issuers],
  });
  await converged('invitation roles reached every replica', id);

  stage = 'genuine invitation replicates';
  const link = CommunityInvitationKey.generate();
  const invitation = await send(honest, id, issuer, 'INVITATION_CREATED', {
    expiresAt: clock + HOUR,
    invitationKey: link.key.publicKey(),
    maxUses: 2,
  });
  const invitationId = invitation.operation.getHash();
  const brief = await send(honest, id, issuer, 'INVITATION_CREATED', {
    expiresAt: clock + 1000,
    invitationKey: CommunityInvitationKey.generate().key.publicKey(),
    maxUses: 1,
  });

  await invitationsConverged('invitations reached every replica', id);
  assert.equal(
    (await second.repository!.findInvitations(id)).list().length,
    2,
    'The second replica must read both invitations',
  );
  console.log('PASS signed invitations replicated between real nodes');

  stage = 'forged invitations are refused';
  const parents = await honest.repository!.findFrontier(id);
  const fieldsOf = (joinerId: string, invited = invitationId) =>
    invitationFieldsOf(id.valueOf(), invited, joinerId, networkId);
  const admission = (
    signer: CommunityOperationSigner,
    proofs: { consent: string; possession: string },
    overrides: {
      createdAt?: number;
      identityId?: string;
      invitationId?: string;
    } = {},
  ): SignedCommunityOperation =>
    signCommunityOperation({
      action: action('MEMBER_JOINED'),
      args: {
        ...proofs,
        identityId: overrides.identityId ?? joiner.id,
        invitationId: overrides.invitationId ?? invitationId,
        method: 'invitation',
      },
      communityId: id.valueOf(),
      createdAt: overrides.createdAt ?? clock++,
      networkId,
      parents,
      signer,
    });
  const genuine = signInvitationProofs(link.key, joiner, fieldsOf(joiner.id));
  const wrongKey = signInvitationProofs(
    CommunityInvitationKey.generate().key,
    joiner,
    fieldsOf(joiner.id),
  );
  const briefProofs = signInvitationProofs(
    link.key,
    joiner,
    fieldsOf(joiner.id, brief.operation.getHash()),
  );
  const wrongConsent = {
    consent: briefProofs.consent,
    possession: genuine.possession,
  };
  const invitationOf = (
    signer: CommunityOperationSigner,
    args: Record<string, unknown>,
  ): SignedCommunityOperation =>
    signCommunityOperation({
      action: action('INVITATION_CREATED'),
      args: {
        invitationKey: CommunityInvitationKey.generate().key.publicKey(),
        ...args,
      },
      communityId: id.valueOf(),
      createdAt: clock++,
      networkId,
      parents,
      signer,
    });
  const aliased = aliasOf(joiner.id);
  const aliasedProofs = genuine;
  const refused: [string, SignedCommunityOperation][] = [
    [
      'an invitation by a member without create_invites',
      invitationOf(plain, { expiresAt: clock + HOUR, maxUses: 1 }),
    ],
    [
      'an invitation above the use limit',
      invitationOf(issuer, { expiresAt: clock + HOUR, maxUses: 101 }),
    ],
    [
      'an admission by an author without manage_members',
      admission(issuer, genuine),
    ],
    [
      'an admission with a bad possession',
      admission(manager, { ...genuine, possession: wrongKey.possession }),
    ],
    [
      'an admission with a bad consent',
      admission(manager, { ...genuine, consent: wrongConsent.consent }),
    ],
    [
      'an admission after the invitation expired',
      admission(manager, briefProofs, {
        createdAt: brief.operation.getCreatedAt() + 1001,
        invitationId: brief.operation.getHash(),
      }),
    ],
    [
      'an admission backdated before the invitation',
      admission(manager, genuine, {
        createdAt: invitation.operation.getCreatedAt() - 1,
      }),
    ],
    [
      'an admission of a non-canonical joiner id',
      admission(manager, aliasedProofs, { identityId: aliased }),
    ],
  ];

  for (const [label, forged] of refused) {
    await assert.rejects(
      honest.repository!.save(forged.operation, forged.proof),
      `${label} must be refused by the node that receives it`,
    );
    await malicious.stores!.communityOperations.put!(record(forged));
  }
  await until('forged invitations reached the raw stores', async () => {
    for (const replica of [honest, second])
      for (const [, forged] of refused)
        if (
          (
            await replica.stores!.communityOperations.query!(
              (value) => value.id === forged.operation.getId(),
            )
          ).length === 0
        )
          return false;

    return true;
  });
  await pause(3000);
  await invitationsConverged('forged invitations changed nothing', id);
  for (const replica of nodes)
    assert.ok(
      !(await replica.repository!.requireById(id)).isMember(
        new IdentityId(joiner.id),
      ),
      `${replica.name} must not admit the joiner through a forgery`,
    );
  console.log(
    `PASS ${refused.length} forged invitations and admissions refused on every replica`,
  );

  stage = 'invitation claims are written once';
  const claimed = signInvitationClaim({
    communityId: id.valueOf(),
    frontier: await honest.repository!.findFrontier(id),
    invitationId,
    joiner,
    key: link.key,
    networkId,
  });

  await honest.claims!.save(claimed.claim, claimed.proof);
  await until('the claim reached every replica', async () => {
    for (const replica of nodes)
      if ((await replica.claims!.findByCommunity(id)).length !== 1)
        return false;

    return true;
  });
  const rival = signInvitationClaim({
    communityId: id.valueOf(),
    frontier: await honest.repository!.findFrontier(id),
    invitationId,
    joiner,
    key: link.key,
    networkId,
  });
  const claimPayload = {
    ...rival.claim.toPrimitives(),
    scopeType: 'community_invitation_claim',
  };

  assert.notEqual(rival.proof.digest(), claimed.proof.digest());
  await malicious.stores!.requests.put!(
    PublicMutationRecord.withProof(claimPayload, rival.proof),
  );
  await pause(3000);
  for (const replica of nodes) {
    const stored = await replica.registry!.queryDocuments(
      'requests',
      (document) => document.id === claimPayload.id,
    );

    assert.deepEqual(
      stored.map((document) =>
        PublicMutationRecord.proofOf(document)?.digest(),
      ),
      [claimed.proof.digest()],
      `${replica.name} must keep the first claim of the joiner only`,
    );
  }
  console.log('PASS a second claim with another proof is refused');

  stage = 'genuine admission replicates';
  await submit(second, id, manager, 'MEMBER_JOINED', {
    ...genuine,
    identityId: joiner.id,
    invitationId,
    method: 'invitation',
  });
  await invitationsConverged('genuine admission reached every replica', id);
  for (const replica of nodes) {
    assert.ok(
      (await replica.repository!.requireById(id)).isMember(
        new IdentityId(joiner.id),
      ),
      `${replica.name} must admit the claimed joiner`,
    );
    assert.equal(
      (await replica.repository!.findInvitations(id)).find(invitationId)
        ? (
            (await invitationsOf(replica, id)) as { id: string; uses: number }[]
          ).find((value) => value.id === invitationId)?.uses
        : -1,
      1,
    );
  }
  console.log('PASS a genuine invitation, claim and admission replicated');
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-communities-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  await startNodes();
  const [honest, second, malicious] = nodes;
  const [owner, alice, bob, carol, erin, mallory] = await Promise.all(
    Array.from({ length: 6 }, () => actor()),
  );

  await connect();
  await synchronization(true);

  stage = 'signed genesis replicates';
  const nonce = randomUUID();
  const communityId = CommunityId.derive(networkId, owner.id, nonce);
  const genesis = signCommunityOperation({
    action: action('COMMUNITY_CREATED'),
    args: {
      autoJoinEnabled: false,
      description: 'Signed community',
      discoverable: true,
      name: 'Forgery target',
      nonce,
      visibility: 'public',
    },
    communityId: communityId.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await honest.repository!.save(genesis.operation, genesis.proof);
  ledger.push(genesis);
  await converged('genesis reached every replica', communityId);
  console.log('PASS signed genesis replicated between three real nodes');

  stage = 'signed membership and roles replicate';
  for (const member of [alice, bob, carol, erin])
    await submit(second, communityId, owner, 'MEMBER_JOINED', {
      identityId: member.id,
      method: 'added',
    });
  await converged('memberships reached every replica', communityId);
  const roleId = CommunityRoleId.derive(
    communityId.valueOf(),
    owner.id,
    clock,
  ).valueOf();

  await submit(honest, communityId, owner, 'ROLE_CREATED', {
    name: 'moderator',
    permissions: ['ban_members'],
    roleId,
  });
  for (const moderator of [alice, carol])
    await submit(honest, communityId, owner, 'MEMBER_ROLES_UPDATED', {
      identityId: moderator.id,
      roleIds: [roleId],
    });
  await converged('roles reached every replica', communityId);
  console.log('PASS signed memberships and roles converged on every replica');

  stage = 'invitations';
  await forgedInvitations(owner);

  stage = 'forged community records are ignored';
  const legitimate = expectedOf(ledger, communityId);
  const forgedFrontier = await malicious.repository!.findFrontier(communityId);
  const forgedId = (suffix: string): string =>
    `community:${communityId.valueOf()}:forged:${suffix}`;
  const tombstone = {
    communityId: communityId.valueOf(),
    deleted: true,
    deletedAt: Date.now() + 10 ** 12,
    id: forgedId('tombstone'),
    networkId,
    removed: true,
    updatedAt: Date.now() + 10 ** 12,
  };
  const forgedOperation = (
    signer: CommunityOperationSigner,
    name: Parameters<typeof action>[0],
    args: Record<string, unknown>,
    id = communityId,
  ): SignedCommunityOperation =>
    signCommunityOperation({
      action: action(name),
      args,
      communityId: id.valueOf(),
      createdAt: clock++,
      networkId,
      parents: forgedFrontier,
      signer,
    });
  const unauthorized = [
    forgedOperation(mallory, 'MEMBER_ROLES_UPDATED', {
      identityId: mallory.id,
      roleIds: [roleId],
    }),
    forgedOperation(mallory, 'MEMBER_JOINED', {
      identityId: mallory.id,
      method: 'automatic',
    }),
    forgedOperation(mallory, 'MEMBER_BANNED', { identityId: owner.id }),
    forgedOperation(carol, 'MEMBER_KICKED', { identityId: alice.id }),
  ];
  const wrongSignature = forgedOperation(
    { ...owner, deviceKeyPair: mallory.deviceKeyPair },
    'MEMBER_BANNED',
    { identityId: alice.id },
  );
  const wrongIdentitySignature = forgedOperation(
    { ...owner, identityKeyPair: mallory.identityKeyPair },
    'MEMBER_BANNED',
    { identityId: alice.id },
  );
  const copiedScope = {
    ...record(ledger[1]),
    communityId: CommunityId.derive(networkId, mallory.id, 'other').valueOf(),
  };
  const swappedProof = PublicMutationRecord.withProof(
    { ...unauthorized[0].operation.toPrimitives() },
    ledger[1].proof,
  );
  const replayed = record(ledger[2]);
  // The owner really signs an update whose avatar is far above the size limit
  // of the arguments: the domain refuses to build it, so the record is made by hand.
  const oversizedContent = {
    action: action('COMMUNITY_UPDATED').valueOf(),
    args: {
      avatar: 'x'.repeat(10_000),
      description: 'Oversized',
      name: 'Oversized',
    },
    authorIdentityId: owner.id,
    communityId: communityId.valueOf(),
    createdAt: clock++,
    networkId,
    parents: forgedFrontier,
    scopeType: 'community_operation',
  };
  const oversizedId = CommunityOperation.recordIdOf(
    communityId.valueOf(),
    PublicMutationProof.digestOf(oversizedContent),
  );
  const oversizedPayload = {
    ...oversizedContent,
    id: oversizedId,
    identitySignature: owner.identityKeyPair
      .sign(CommunityOperation.identitySigningContentOf(oversizedId))
      .toString(),
  };
  const oversizedUpdate = PublicMutationRecord.withProof(
    oversizedPayload,
    signCommunityOperationRecord(oversizedPayload, owner),
  );
  const forgedRecords = [
    tombstone,
    ...unauthorized.map(record),
    record(wrongSignature),
    record(wrongIdentitySignature),
    copiedScope,
    swappedProof,
    replayed,
    oversizedUpdate,
  ];

  for (const forged of forgedRecords)
    await malicious.stores!.communityOperations.put!(forged);
  await malicious.stores!.heads.put!(
    `community-operation-index:${communityId.valueOf()}`,
    {
      communityId: communityId.valueOf(),
      communityOperations: [tombstone, ...forgedRecords.slice(1, 5)],
      id: `community-operation-index:${communityId.valueOf()}`,
      networkId,
      updatedAt: Date.now() + 10 ** 12,
    },
  );
  await until('forged records reached the honest raw stores', async () => {
    for (const replica of [honest, second]) {
      const stored = await replica.stores!.communityOperations.query!(
        (value) => value.id === tombstone.id,
      );

      if (stored.length === 0) return false;
    }

    return true;
  });
  await pause(3000);
  await assertHeadsIndexOnlySignedOperations(communityId);
  for (const replica of nodes) {
    const community = await replica.repository!.requireById(communityId);

    assert.ok(community, `${replica.name} must still serve the community`);
    assert.deepEqual(
      JSON.parse(JSON.stringify(community.toPrimitives())),
      JSON.parse(JSON.stringify(legitimate.community!.toPrimitives())),
      `${replica.name} must not apply any forged community record`,
    );
    assert.ok(!community.isMember(new IdentityId(mallory.id)));
    assert.deepEqual(
      await replica.repository!.findFrontier(communityId),
      legitimate.frontier,
    );
  }
  console.log(
    'PASS forged tombstone, roles, bans, joins, kicks, copied scope, swapped proof, replay and oversized arguments rejected on every replica',
  );

  stage = 'concurrent partitions converge by the total order';
  await synchronization(false);
  await submit(honest, communityId, alice, 'MEMBER_BANNED', {
    identityId: bob.id,
  });
  await submit(second, communityId, owner, 'MEMBER_ROLES_UPDATED', {
    identityId: alice.id,
    roleIds: [],
  });
  await submit(malicious, communityId, bob, 'MEMBER_LEFT', {
    identityId: bob.id,
  });
  const branches = await Promise.all(
    nodes.map((replica) => replica.repository!.findFrontier(communityId)),
  );

  assert.equal(
    new Set(branches.map((frontier) => frontier.join())).size,
    3,
    'Partitioned replicas must hold three independent branches',
  );
  await connect();
  await synchronization(true);
  await exchanged();
  await converged('partitions healed to the folded state', communityId);
  const healed = expectedOf(ledger, communityId);

  assert.equal(healed.frontier.length, 3, 'Healed state keeps every branch');
  assert.ok(
    !healed.community!.isMember(new IdentityId(bob.id)),
    'Bob left the community on one branch and was banned on another',
  );
  await submit(second, communityId, owner, 'COMMUNITY_UPDATED', {
    description: 'Merged every partitioned branch',
    name: 'Forgery target',
  });
  await converged('one operation merged the three branches', communityId);
  assert.equal(
    (await honest.repository!.findFrontier(communityId)).length,
    1,
    'An operation built on the healed frontier merges every branch',
  );
  console.log('PASS partitioned replicas healed to one folded state');

  stage = 'restart recovery';
  await synchronization(false, [second]);
  second.registry!.clear();
  await second.orbitdb!.stop();
  second.orbitdb = undefined;
  const beforeUpdate = [...ledger];

  await submit(honest, communityId, owner, 'COMMUNITY_UPDATED', {
    description: 'Updated while a replica was offline',
    name: 'Renamed target',
  });
  await open(second);
  await converged(
    'restarted replica rebuilt its state from persisted operations',
    communityId,
    [second],
    beforeUpdate,
  );
  await connect();
  await synchronization(true, [second]);
  await exchanged();
  await converged('restarted replica caught up', communityId);
  console.log('PASS restarted replica recovered and caught up');

  stage = 'signed tombstone';
  const doomedNonce = randomUUID();
  const doomed = CommunityId.derive(networkId, owner.id, doomedNonce);
  const doomedGenesis = signCommunityOperation({
    action: action('COMMUNITY_CREATED'),
    args: {
      autoJoinEnabled: false,
      description: 'Only the owner is left',
      discoverable: true,
      name: 'Doomed',
      nonce: doomedNonce,
      visibility: 'public',
    },
    communityId: doomed.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await honest.repository!.save(doomedGenesis.operation, doomedGenesis.proof);
  ledger.push(doomedGenesis);
  await converged('doomed community replicated', doomed);
  const leaving = await submit(second, doomed, owner, 'MEMBER_LEFT', {
    identityId: owner.id,
  });

  await converged('signed tombstone replicated', doomed);
  assert.equal(await honest.repository!.hasById(doomed), false);
  const revival = signCommunityOperation({
    action: action('COMMUNITY_UPDATED'),
    args: { description: 'Back from the dead', name: 'Revived' },
    communityId: doomed.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [leaving.operation.getHash()],
    signer: owner,
  });

  await malicious.stores!.communityOperations.put!(record(revival));
  await until('revival attempt reached the honest replicas', async () => {
    const stored = await honest.stores!.communityOperations.query!(
      (value) => value.id === revival.operation.getId(),
    );

    return stored.length === 1;
  });
  await pause(1500);
  for (const replica of nodes)
    assert.equal(
      await replica.repository!.hasById(doomed),
      false,
      `${replica.name} must keep the signed tombstone`,
    );
  console.log(
    'PASS signed tombstone applied and no later operation revives it',
  );

  stage = 'revoked device';
  await submit(honest, communityId, carol, 'MEMBER_BANNED', {
    identityId: erin.id,
  });
  await converged('moderator ban replicated', communityId);
  authorized.delete(`${carol.id}|${carol.deviceCredential}`);
  const afterRevocation = signCommunityOperation({
    action: action('MEMBER_UNBANNED'),
    args: { identityId: erin.id },
    communityId: communityId.valueOf(),
    createdAt: clock++,
    networkId,
    parents: await honest.repository!.findFrontier(communityId),
    signer: carol,
  });

  await assert.rejects(
    honest.repository!.save(afterRevocation.operation, afterRevocation.proof),
    'A revoked device must not be able to sign operations',
  );
  await malicious.stores!.communityOperations.put!(record(afterRevocation));
  await until('revoked operation reached the honest replicas', async () => {
    const stored = await second.stores!.communityOperations.query!(
      (value) => value.id === afterRevocation.operation.getId(),
    );

    return stored.length === 1;
  });
  await pause(1500);
  for (const replica of nodes) {
    const community = await replica.repository!.requireById(communityId);

    assert.ok(
      community
        ?.toPrimitives()
        .bannedMemberIds.some(
          (banned: string) => new IdentityId(banned).valueOf() === erin.id,
        ),
      `${replica.name} must ignore the operation of a revoked device`,
    );
  }
  console.log('PASS operations of a revoked device rejected on every replica');
  stage = 'signed kick';
  await submit(second, communityId, owner, 'MEMBER_KICKED', {
    identityId: alice.id,
  });
  await converged('kick reached every replica', communityId);
  for (const replica of nodes) {
    const community = await replica.repository!.requireById(communityId);

    assert.ok(
      community && !community.isMember(new IdentityId(alice.id)),
      `${replica.name} must drop the kicked member`,
    );
  }
  console.log('PASS signed kick removed the member on every replica');
}

const watchdog = setTimeout(() => {
  console.error(`FAIL forged community operations deadline during ${stage}`);
  process.exit(1);
}, 280000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged community operations during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
