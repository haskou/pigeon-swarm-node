import 'reflect-metadata';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import OrbitDBConversationMessageMapper from '@app/contexts/conversations/infrastructure/orbitdb/mappers/OrbitDBConversationMessageMapper';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import ConversationMessageMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageMutationPolicy';
import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallNonce } from '@app/contexts/calls/domain/value-objects/CallNonce';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import CallEndMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallEndMutationPolicy';
import CallParticipantMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallParticipantMutationPolicy';
import CallStartMutationPolicy from '@app/contexts/calls/infrastructure/orbitdb/policies/CallStartMutationPolicy';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';
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
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { signConversationOperation } from '../../support/signConversationOperation';
import {
  CallSigner,
  signCallEnd,
  signCallParticipant,
  signCallStart,
} from '../../support/signCall';
import { teardownAndExit } from './RealTransportTeardown';

/**
 * The honest node enforces the mutation gate; the control node replicates the
 * same stores with no gate, so a forged record that reaches the honest node's
 * raw store AND the control node's raw store proves the attack was real and
 * only the gate kept it out of the honest state.
 */
type Replica = {
  name: string;
  gated: boolean;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: {
    conversationOperations: OrbitDBDatabase;
    heads: OrbitDBDatabase;
    messages: OrbitDBDatabase;
    calls: OrbitDBDatabase;
  };
  registry?: OrbitDBReplicatedStateRegistry;
  conversations?: OrbitDBConversationRepository;
  repository?: OrbitDBCallRepository;
};

/** No community exists in this fixture, so community starts cannot be admitted. */
const noCommunities = {
  findById: () => Promise.resolve(undefined),
} as never;
const networkId = randomUUID();
const nodes: Replica[] = [];
const authorized = new Set<string>();
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

async function actor(): Promise<CallSigner> {
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
  const documents = async (name: string): Promise<OrbitDBDatabase> =>
    replica.orbitdb!.open(`${networkId}/${name}`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    });

  replica.stores = {
    conversationOperations: await documents('conversationOperations'),
    heads: await replica.orbitdb.open(`${networkId}/heads`, {
      AccessController,
      sync: false,
      type: 'keyvalue',
    }),
    messages: await documents('messages'),
    calls: await documents('calls'),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();
  const conversations = new OrbitDBConversationRepository(
    registry,
    new OrbitDBConversationMessageMapper(),
  );

  if (replica.gated)
    registry.addMutationGate(
      new PublicMutationGate(new PublicMutationVerifier(authorization), [
        new ConversationOperationMutationPolicy(),
        new ConversationMessageMutationPolicy(conversations),
        new CallStartMutationPolicy(registry, conversations, noCommunities),
        new CallParticipantMutationPolicy(registry, noCommunities),
        new CallEndMutationPolicy(registry),
      ]),
    );
  replica.registry = registry;
  replica.conversations = conversations;
  await registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
  const projection = new OrbitDBCallProjection(registry);

  replica.repository = new OrbitDBCallRepository(
    registry,
    projection,
    new InMemoryCallParticipantLeaseRepository(),
    new PrivateCommunityPublicStorageGuard(
      { findScope: () => Promise.resolve(undefined) } as never,
      new PrivateAuthorizationStorageCoordinator(),
    ),
  );
  await projection.start();
}

async function disconnected(replicas: Replica[]): Promise<void> {
  await Promise.all(
    replicas.flatMap((replica) =>
      replica.helia.libp2p
        .getConnections()
        .map((connection) => connection.close()),
    ),
  );
  await until('private connections closed', () =>
    Promise.resolve(
      replicas.every(
        (replica) => replica.helia.libp2p.getConnections().length === 0,
      ),
    ),
  );
}

async function synchronization(enabled: boolean): Promise<void> {
  for (const store of nodes.flatMap((replica) =>
    Object.values(replica.stores!),
  )) {
    assert.ok(store.sync, 'Real OrbitDB synchronization controls are required');
    await store.sync[enabled ? 'start' : 'stop']();
  }

  if (!enabled) await disconnected(nodes);
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

const act = (name: keyof typeof ConversationOperationAction & string): string =>
  (
    ConversationOperationAction[name] as unknown as { valueOf(): string }
  ).valueOf();

const NONCE = (n: number): string =>
  `call-e2e-nonce-${String(n).padStart(6, '0')}`;

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-calls-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  await startNodes();
  const [honest, malicious, control] = nodes;
  const [owner, alice, bob, mallory, outsider] = await Promise.all(
    Array.from({ length: 5 }, () => actor()),
  );

  await connect();
  await synchronization(true);

  stage = 'signed group creation replicates';
  const nonce = randomUUID();
  const group = ConversationId.deriveGroup(networkId, owner.id, nonce);
  const genesis = signConversationOperation({
    action: act('CONVERSATION_CREATED'),
    args: {
      name: 'Calls',
      nonce,
      participantIds: [owner.id, alice.id, bob.id].sort(),
      type: 'group',
    },
    conversationId: group.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await honest.conversations!.saveOperation(genesis.operation, genesis.proof);
  await until('group reached every node', async () => {
    for (const replica of nodes)
      if (!(await replica.conversations!.findMetadataById(group))) return false;

    return true;
  });

  stage = 'signed call start and join replicate';
  const scope = {
    conversationId: group.valueOf(),
    type: 'conversation',
  } as const;
  const participantIds = [owner.id, alice.id, bob.id].sort();
  const startedAt = Date.now();
  const call = Call.start(
    new IdentityId(owner.id),
    new NetworkId(networkId),
    CallScope.conversation(group),
    participantIds.map((id) => new IdentityId(id)),
    new CallNonce(NONCE(1)),
    new Timestamp(startedAt),
  );

  const start = signCallStart({
    networkId,
    nonce: NONCE(1),
    participantIds: call.toPrimitives().participantIds,
    scope,
    signer: owner,
    startedAt,
  });
  assert.equal(call.getId().valueOf(), start.callId);
  await honest.repository!.saveStart(call, start.proof);
  const callId = new CallId(start.callId);
  const statusOf = async (replica: Replica): Promise<string | undefined> =>
    (await replica.repository!.findById(callId))?.toPrimitives().status;

  await until('call reached every node', async () => {
    for (const replica of nodes)
      if ((await statusOf(replica)) !== 'active') return false;

    return true;
  });
  const joined = signCallParticipant({
    at: startedAt + 1000,
    callId: start.callId,
    signer: alice,
    state: 'joined',
  });

  call.join(new IdentityId(alice.id), new Timestamp(startedAt + 1000));
  await control.repository!.saveParticipant(
    call,
    new IdentityId(alice.id),
    new Timestamp(startedAt + 1000),
    joined.proof,
  );
  await until('join reached every node', async () => {
    for (const replica of nodes) {
      const found = await replica.repository!.findById(callId);

      if (
        !found
          ?.toPrimitives()
          .participants.some(
            (value) =>
              value.identityId === alice.id && value.status === 'joined',
          )
      )
        return false;
    }

    return true;
  });
  console.log('PASS signed call start and join replicated to three nodes');

  stage = 'forged call records are ignored';
  const forgedIds: string[] = [];
  const plant = async (
    payload: { id: string } & Record<string, unknown>,
    proof: ReturnType<typeof signCallStart>['proof'],
  ): Promise<void> => {
    forgedIds.push(payload.id);
    await malicious.stores!.calls.put!(
      PublicMutationRecord.withProof(payload, proof),
    );
  };
  const forgedStart = (
    signer: CallSigner,
    n: number,
    inScope: typeof scope | Record<string, unknown> = scope,
    ids: string[] = participantIds,
    at = Date.now(),
  ) =>
    signCallStart({
      networkId,
      nonce: NONCE(n),
      participantIds: ids,
      scope: inScope as never,
      signer,
      startedAt: at,
    });
  const ringing = forgedStart(mallory, 2);

  // A ringing call in a group the author does not belong to.
  await plant(ringing.payload, ringing.proof);
  // A ringing call in a conversation nobody knows.
  const unknown = forgedStart(
    mallory,
    3,
    { conversationId: 'group:unknown', type: 'conversation' },
    [mallory.id, alice.id],
  );

  await plant(unknown.payload, unknown.proof);
  // A start that invites someone outside the conversation.
  const invitesOutsider = forgedStart(owner, 4, scope, [owner.id, outsider.id]);

  await plant(invitesOutsider.payload, invitesOutsider.proof);
  // A start dated far in the future.
  const future = forgedStart(
    owner,
    5,
    scope,
    participantIds,
    Date.now() + 10 ** 9,
  );

  await plant(future.payload, future.proof);
  // A community channel call with an invented session epoch.
  const community = signCallStart({
    networkId,
    nonce: NONCE(6),
    scope: {
      channelId: 'channel',
      communityId: 'community',
      type: 'community_channel',
    },
    sessionEpoch: 1_000_000,
    signer: mallory,
    startedAt: Date.now(),
  });

  await plant(community.payload, community.proof);
  // A join by someone outside the conversation for the real call.
  const outsiderJoin = signCallParticipant({
    at: Date.now(),
    callId: start.callId,
    signer: mallory,
    state: 'joined',
  });

  await plant(outsiderJoin.payload, outsiderJoin.proof);
  // A participant record for a call no admitted start backs.
  const orphan = signCallParticipant({
    at: Date.now(),
    callId: ringing.callId,
    signer: owner,
    state: 'joined',
  });

  await plant(orphan.payload, orphan.proof);
  // An end of the real call by someone outside the conversation.
  const forgedEnd = signCallEnd({
    at: Date.now(),
    callId: start.callId,
    signer: mallory,
  });

  await plant(forgedEnd.payload, forgedEnd.proof);
  // A flood of starts by the outsider.
  for (let n = 100; n < 140; n++) {
    const flood = forgedStart(mallory, n);

    await plant(flood.payload, flood.proof);
  }

  const wanted = new Set(forgedIds);

  await until('forged records reached the raw stores', async () => {
    for (const replica of [honest, control]) {
      const stored = await replica.stores!.calls.query!((value) =>
        wanted.has(value.id as string),
      );

      if (stored.length !== wanted.size) return false;
    }

    return true;
  });
  await pause(3000);

  for (const forged of [ringing, unknown, invitesOutsider, future, community])
    assert.equal(
      await honest.repository!.findById(new CallId(forged.callId)),
      undefined,
      `call ${forged.callId} must not be admitted`,
    );
  assert.deepEqual(
    await honest.repository!.findActiveByParticipant(new IdentityId(alice.id)),
    [honest.repository && (await honest.repository.findById(callId))].filter(
      Boolean,
    ),
    'Only the signed call may be active for a participant',
  );
  const real = (await honest.repository!.findById(callId))!.toPrimitives();

  assert.equal(real.status, 'active', 'A forged end must not end the call');
  assert.ok(
    !real.participants.some((value) => value.identityId === mallory.id),
    'A forged join must not add a participant',
  );
  assert.deepEqual(
    await honest.repository!.findActiveByParticipant(
      new IdentityId(mallory.id),
    ),
    [],
  );
  assert.equal(
    (
      await control.stores!.calls.query!(
        (value) => value.id === ringing.payload.id,
      )
    ).length,
    1,
    'The ungated control node must hold the forged start, otherwise the test proves nothing',
  );
  console.log(
    'PASS forged ringing call, unknown conversation, outsider invitee, future start, invented community sessionEpoch, outsider join, orphan join, outsider end and a flood of starts rejected',
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL forged calls deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged calls during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
