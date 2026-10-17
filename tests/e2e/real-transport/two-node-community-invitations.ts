import 'reflect-metadata';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import CommunityInvitationPreviewer from '@app/contexts/communities/application/preview-invitation/CommunityInvitationPreviewer';
import { CommunityInvitationPreviewMessage } from '@app/contexts/communities/application/preview-invitation/messages/CommunityInvitationPreviewMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
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
import { setTimeout as sleep } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

import {
  invitationFieldsOf,
  signInvitationProofs,
} from '../../support/signCommunityInvitation';
import {
  CommunityOperationSigner,
  signCommunityOperation,
  SignedCommunityOperation,
} from '../../support/signCommunityOperation';
import { teardownAndExit } from './RealTransportTeardown';

/**
 * Signed community invitations between two real replicas: a removed manager's
 * backdated admission is voided on both, concurrent admissions and a
 * revocation converge to the same fold after a partition, a revoked
 * invitation is neither previewed nor admitted anywhere and a restarted
 * replica replays the same invitation state from its ledger.
 */

type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: { communityOperations: OrbitDBDatabase; heads: OrbitDBDatabase };
  repository?: OrbitDBCommunityRepository;
};

interface Fixture {
  communityId: CommunityId;
  invitationId: string;
  key: CommunityInvitationKey;
}

const registries = new Map<string, OrbitDBReplicatedStateRegistry>();
const HOUR = 3_600_000;
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
// Invitations are open by the node's own clock, so the ledger starts now.
let clock = Date.now() - 60_000;
let stage = 'setup';
let root: string;
let owner: CommunityOperationSigner;

const action = (name: keyof typeof CommunityOperationAction & string): string =>
  (
    CommunityOperationAction[name] as unknown as { valueOf(): string }
  ).valueOf();

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
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();

  registry.addMutationGate(
    new PublicMutationGate(new PublicMutationVerifier(authorization), [
      new CommunityOperationMutationPolicy(),
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
  registries.set(replica.name, registry);
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

function expectedOf(id: CommunityId) {
  return CommunityStateFold.fold(
    ledger
      .map((signed) => signed.operation)
      .filter((operation) => operation.getCommunityId().isEqual(id)),
  );
}

/** The invitations a replica serves, as the API shows them. */
async function invitationsOf(
  replica: Replica,
  id: CommunityId,
): Promise<unknown[]> {
  const community = await replica.repository!.requireById(id);

  const primitives = (await replica.repository!.findInvitations(id))
    .list()
    .map((invitation) => invitation.toPrimitives(community))
    .sort((left, right) => left.id.localeCompare(right.id));

  return primitives.map(
    (value) => JSON.parse(JSON.stringify(value)) as unknown,
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

/** Signs on the replica's own frontier and saves through its gate. */
async function send(
  replica: Replica,
  id: CommunityId,
  signer: CommunityOperationSigner,
  name: keyof typeof CommunityOperationAction & string,
  args: Record<string, unknown>,
  createdAt = clock++,
): Promise<SignedCommunityOperation> {
  const signed = signCommunityOperation({
    action: action(name),
    args,
    communityId: id.valueOf(),
    createdAt,
    networkId,
    parents: await replica.repository!.findFrontier(id),
    signer,
  });

  await replica.repository!.save(signed.operation, signed.proof);
  ledger.push(signed);

  return signed;
}

function admissionArgs(
  fixture: Fixture,
  joiner: CommunityOperationSigner,
): Record<string, unknown> {
  return {
    ...signInvitationProofs(
      fixture.key,
      joiner,
      invitationFieldsOf(
        fixture.communityId.valueOf(),
        fixture.invitationId,
        joiner.id,
        networkId,
      ),
    ),
    identityId: joiner.id,
    invitationId: fixture.invitationId,
    method: 'invitation',
  };
}

/** A community whose `staff` role may invite and admit, with one live invitation. */
async function community(
  staff: CommunityOperationSigner[],
  issuer: CommunityOperationSigner,
  maxUses: number,
): Promise<Fixture> {
  const [first] = nodes;
  const nonce = randomUUID();
  const communityId = CommunityId.derive(networkId, owner.id, nonce);
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
    communityId: communityId.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await first.repository!.save(genesis.operation, genesis.proof);
  ledger.push(genesis);
  for (const member of new Set([...staff, issuer]))
    await send(first, communityId, owner, 'MEMBER_JOINED', {
      identityId: member.id,
      method: 'added',
    });
  const staffRole = CommunityRoleId.derive(
    communityId.valueOf(),
    owner.id,
    clock,
  ).valueOf();

  await send(first, communityId, owner, 'ROLE_CREATED', {
    name: 'staff',
    permissions: ['create_invites', 'manage_members'],
    roleId: staffRole,
  });
  for (const member of new Set([...staff, issuer]))
    await send(first, communityId, owner, 'MEMBER_ROLES_UPDATED', {
      identityId: member.id,
      roleIds: [staffRole],
    });
  const link = CommunityInvitationKey.generate();
  const invitation = await send(
    first,
    communityId,
    issuer,
    'INVITATION_CREATED',
    {
      expiresAt: clock + HOUR,
      invitationKey: link.key.publicKey(),
      maxUses,
    },
  );

  await converged('the invitation reached both replicas', communityId);

  return {
    communityId,
    invitationId: invitation.operation.getHash(),
    key: link.key,
  };
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

async function previewFails(
  replica: Replica,
  fixture: Fixture,
): Promise<boolean> {
  const previewer = new CommunityInvitationPreviewer(
    {
      findById: (id: CommunityId) => replica.repository!.requireById(id),
    } as unknown as CommunityFinder,
    replica.repository!,
  );

  try {
    await previewer.preview(
      new CommunityInvitationPreviewMessage(
        fixture.communityId.valueOf(),
        fixture.key.publicKey(),
      ),
    );

    return false;
  } catch (error) {
    return error instanceof CommunityNotFoundError;
  }
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-community-invitations-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  await startNodes();
  const [first, second] = nodes;
  const [ownerSigner, doomed, manager, issuer, ...joiners] = await Promise.all(
    Array.from({ length: 9 }, () => actor()),
  );

  owner = ownerSigner;
  await connect();
  await synchronization(true);

  stage = 'communities and invitations replicate before the partition';
  const removal = await community([doomed], doomed, 1);
  const concurrent = await community([manager], issuer, 2);
  const revoked = await community([manager], issuer, 2);

  stage = 'a live invitation is previewed on both replicas';
  for (const replica of nodes)
    assert.equal(
      await previewFails(replica, revoked),
      false,
      `${replica.name} must preview a live invitation`,
    );
  console.log('PASS a live invitation is previewed on both replicas');

  stage = 'concurrent changes during the partition';
  await synchronization(false);
  // The admission is signed before the kick, so it is backdated; it stays
  // concurrent with the kick, which is what voids it.
  await send(
    second,
    removal.communityId,
    doomed,
    'MEMBER_JOINED',
    admissionArgs(removal, joiners[0]),
  );
  await send(first, removal.communityId, owner, 'MEMBER_KICKED', {
    identityId: doomed.id,
  });
  await send(
    first,
    concurrent.communityId,
    manager,
    'MEMBER_JOINED',
    admissionArgs(concurrent, joiners[1]),
  );
  await send(
    second,
    concurrent.communityId,
    manager,
    'MEMBER_JOINED',
    admissionArgs(concurrent, joiners[2]),
  );
  await send(second, concurrent.communityId, issuer, 'INVITATION_REVOKED', {
    invitationId: concurrent.invitationId,
  });

  stage = 'partition heals';
  await connect();
  await synchronization(true);
  await exchanged();

  stage = 'removed manager admission is voided';
  const afterKick = await converged(
    'the kick and the backdated admission converged on both replicas',
    removal.communityId,
  );

  for (const replica of nodes) {
    const community = await replica.repository!.requireById(
      removal.communityId,
    );

    assert.ok(
      !community.isMember(new IdentityId(joiners[0].id)),
      `${replica.name} must void the admission of a removed manager`,
    );
    assert.ok(!community.isMember(new IdentityId(doomed.id)));
  }
  assert.ok(!afterKick.isMember(new IdentityId(joiners[0].id)));
  console.log(
    'PASS a removed manager backdated admission is voided on both replicas',
  );

  stage = 'concurrent admissions and revocation converge';
  await converged(
    'concurrent admissions and the revocation converged on both replicas',
    concurrent.communityId,
  );
  const [left, right] = await Promise.all(
    nodes.map((replica) => invitationsOf(replica, concurrent.communityId)),
  );

  assert.deepEqual(left, right, 'Both replicas must fold the same invitations');
  console.log(
    'PASS concurrent admissions and a revocation converged on both replicas',
  );

  stage = 'a revoked invitation is refused';
  await send(first, revoked.communityId, issuer, 'INVITATION_REVOKED', {
    invitationId: revoked.invitationId,
  });
  await converged('the revocation reached both replicas', revoked.communityId);
  for (const replica of nodes) {
    assert.equal(
      await previewFails(replica, revoked),
      true,
      `${replica.name} must not preview a revoked invitation`,
    );
    const late = signCommunityOperation({
      action: action('MEMBER_JOINED'),
      args: admissionArgs(revoked, joiners[3]),
      communityId: revoked.communityId.valueOf(),
      createdAt: clock++,
      networkId,
      parents: await replica.repository!.findFrontier(revoked.communityId),
      signer: manager,
    });

    await assert.rejects(
      replica.repository!.save(late.operation, late.proof),
      `${replica.name} must refuse an admission by a revoked invitation`,
    );
    assert.ok(
      !(await replica.repository!.requireById(revoked.communityId)).isMember(
        new IdentityId(joiners[3].id),
      ),
    );
  }
  console.log(
    'PASS a revoked invitation is neither previewed nor admitted on both replicas',
  );

  stage = 'a restarted replica replays the invitation state';
  const fixtures = [removal, concurrent, revoked];
  const before = await Promise.all(
    fixtures.map((fixture) => invitationsOf(second, fixture.communityId)),
  );

  registries.get(second.name)!.clear();
  await second.orbitdb!.stop();
  second.orbitdb = undefined;
  await open(second);
  for (const [index, fixture] of fixtures.entries()) {
    await converged(
      'the restarted replica rebuilt its state',
      fixture.communityId,
    );
    assert.deepEqual(
      await invitationsOf(second, fixture.communityId),
      before[index],
      'A restarted replica must replay the same invitation state',
    );
  }
  assert.equal(await previewFails(second, revoked), true);
  console.log('PASS a restarted replica replayed the same invitation state');
}

const watchdog = setTimeout(() => {
  console.error(`FAIL community invitations deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL community invitations during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
