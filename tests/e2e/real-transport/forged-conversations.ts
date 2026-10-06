import 'reflect-metadata';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationLimits } from '@app/contexts/conversations/domain/operations/ConversationOperationLimits';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import OrbitDBConversationMessageMapper from '@app/contexts/conversations/infrastructure/orbitdb/mappers/OrbitDBConversationMessageMapper';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import ConversationMessageMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageMutationPolicy';
import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
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
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  ConversationOperationSigner,
  signConversationOperation,
  signConversationOperationRecord,
  SignedConversationOperation,
} from '../../support/signConversationOperation';
import { teardownAndExit } from './RealTransportTeardown';

/**
 * The honest node enforces the mutation gate; the control node replicates the
 * same stores with no gate, so a forged record that reaches the honest node's
 * raw store AND the control node's folded index proves the attack was real and
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
  };
  registry?: OrbitDBReplicatedStateRegistry;
  repository?: OrbitDBConversationRepository;
};

type Hand = {
  content: Record<string, unknown>;
  signer: ConversationOperationSigner;
};

/** The protocol limit is 1000 operations per author; a smaller one keeps the replicated head within one block. */
const QUOTA = 30;

const act = (name: keyof typeof ConversationOperationAction & string): string =>
  (
    ConversationOperationAction[name] as unknown as { valueOf(): string }
  ).valueOf();

const networkId = randomUUID();
const nodes: Replica[] = [];
const authorized = new Set<string>();
const ledger: SignedConversationOperation[] = [];
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

async function actor(): Promise<ConversationOperationSigner> {
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
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();
  const repository = new OrbitDBConversationRepository(
    registry,
    new OrbitDBConversationMessageMapper(),
  );

  if (replica.gated)
    registry.addMutationGate(
      new PublicMutationGate(new PublicMutationVerifier(authorization), [
        new ConversationOperationMutationPolicy(),
        new ConversationMessageMutationPolicy(repository),
      ]),
    );
  replica.registry = registry;
  replica.repository = repository;
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

const idsOf = (id: ConversationId): Set<string> =>
  new Set(
    ledger
      .filter((signed) => signed.operation.getConversationId().isEqual(id))
      .map((signed) => signed.operation.getId()),
  );

const expectedOf = (id: ConversationId) =>
  ConversationStateFold.fold(
    ledger
      .filter((signed) => signed.operation.getConversationId().isEqual(id))
      .map((signed) => signed.operation),
  );

/** What a conversation looks like to its members, order independent. */
const viewOf = (value: {
  adminIds: string[];
  creatorId: string;
  name?: string;
  participantIds: string[];
}): unknown => ({
  admins: [...value.adminIds].sort(),
  creator: value.creatorId,
  members: [...value.participantIds].sort(),
  name: value.name,
});

function expectedView(id: ConversationId): unknown {
  const roster = expectedOf(id).roster;

  if (!roster) return undefined;
  const { admins, creator, members, name } = roster.toPrimitives();

  return viewOf({
    adminIds: admins,
    creatorId: creator,
    name,
    participantIds: members,
  });
}

async function observedView(
  replica: Replica,
  id: ConversationId,
): Promise<unknown> {
  const conversation = await replica.repository!.findMetadataById(id);

  if (!conversation) return undefined;

  return viewOf(
    JSON.parse(JSON.stringify(conversation.toPrimitives())) as Parameters<
      typeof viewOf
    >[0],
  );
}

async function converged(
  label: string,
  id: ConversationId,
  replicas = nodes,
): Promise<void> {
  const expected = expectedOf(id);
  const observed: string[] = [];

  try {
    await until(label, async () => {
      observed.length = 0;
      for (const replica of replicas) {
        const frontier = await replica.repository!.findFrontier(id);

        observed.push(`${replica.name}: frontier=${frontier.join(',')}`);

        if (
          !isDeepStrictEqual(
            await observedView(replica, id),
            expectedView(id),
          ) ||
          !isDeepStrictEqual(frontier, expected.frontier)
        )
          return false;
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
  id: ConversationId,
  signer: ConversationOperationSigner,
  name: Parameters<typeof act>[0],
  args: Record<string, unknown>,
): Promise<SignedConversationOperation> {
  const signed = signConversationOperation({
    action: act(name),
    args,
    conversationId: id.valueOf(),
    createdAt: clock++,
    networkId,
    parents: await replica.repository!.findFrontier(id),
    signer,
  });

  await replica.repository!.saveOperation(signed.operation, signed.proof);
  ledger.push(signed);

  return signed;
}

function record(signed: SignedConversationOperation): Record<string, unknown> {
  return PublicMutationRecord.withProof(
    { ...signed.operation.toPrimitives() },
    signed.proof,
  );
}

/** A record the domain would refuse to build, signed by a real device. */
function handmade({ content, signer }: Hand): Record<string, unknown> {
  const id = ConversationOperation.recordIdOf(
    content.conversationId as string,
    PublicMutationProof.digestOf(content),
  );
  const payload = { ...content, id };

  return PublicMutationRecord.withProof(
    payload,
    signConversationOperationRecord(payload, signer),
  );
}

const content = (
  signer: ConversationOperationSigner,
  name: Parameters<typeof act>[0],
  conversationId: ConversationId,
  args: Record<string, unknown>,
  parents: string[],
): Record<string, unknown> => ({
  action: act(name),
  args,
  authorIdentityId: signer.id,
  conversationId: conversationId.valueOf(),
  createdAt: clock++,
  networkId,
  parents,
  scopeType: 'conversation_operation',
});

const groupGenesis = (
  creator: ConversationOperationSigner,
  members: ConversationOperationSigner[],
  name: string,
): { id: ConversationId; nonce: string; args: Record<string, unknown> } => {
  const nonce = randomUUID();

  return {
    args: {
      name,
      nonce,
      participantIds: [creator, ...members].map((member) => member.id).sort(),
      type: 'group',
    },
    id: ConversationId.deriveGroup(networkId, creator.id, nonce),
    nonce,
  };
};

/**
 * The malicious node writes straight into the replicated stores: the records
 * plus an index head that lists the legitimate operations next to them and
 * claims to be newer than anything honest.
 */
async function plant(
  malicious: Replica,
  id: ConversationId,
  forged: Record<string, unknown>[],
  legitimate: Record<string, unknown>[] = ledger
    .filter((signed) => signed.operation.getConversationId().isEqual(id))
    .map(record),
): Promise<void> {
  for (const forgery of forged)
    await malicious.stores!.conversationOperations.put!(forgery);
  const key = `conversation-operation-index:${id.valueOf()}`;

  await malicious.stores!.heads.put!(key, {
    conversationId: id.valueOf(),
    conversationOperations: [...legitimate, ...forged],
    id: key,
    networkId,
    updatedAt: Date.now() + 10 ** 12,
  });
}

async function reachedRawStores(
  label: string,
  replicas: Replica[],
  forged: Record<string, unknown>[],
): Promise<void> {
  const wanted = new Set(forged.map((forgery) => forgery.id as string));

  await until(`${label} reached the raw stores`, async () => {
    for (const replica of replicas) {
      const stored = await replica.stores!.conversationOperations.query!(
        (value) => wanted.has(value.id as string),
      );

      if (stored.length !== wanted.size) return false;
    }

    return true;
  });
}

async function assertNoForgedOperation(
  label: string,
  id: ConversationId,
  replica: Replica,
): Promise<void> {
  const legitimate = idsOf(id);
  const stored = (await replica.repository!.findOperations(id)).map(
    (operation) => operation.getId(),
  );

  assert.deepEqual(
    stored.filter((operationId) => !legitimate.has(operationId)),
    [],
    `${replica.name} (${label}) must not admit a forged operation`,
  );
  assert.deepEqual(
    await observedView(replica, id),
    expectedView(id),
    `${replica.name} (${label}) must fold only honest operations`,
  );
  assert.deepEqual(
    await replica.repository!.findFrontier(id),
    expectedOf(id).frontier,
    `${replica.name} (${label}) frontier`,
  );
}

/** The control node holds the forged operations in its index; its fold still skips them. */
async function assertControlHoldsForged(
  id: ConversationId,
  control: Replica,
  forgedIds: string[],
): Promise<void> {
  const held = new Set(
    (await control.repository!.findOperations(id)).map((operation) =>
      operation.getId(),
    ),
  );

  assert.ok(
    forgedIds.some((forgedId) => held.has(forgedId)),
    'The ungated control node must replicate and index the forged records, otherwise the test proves nothing',
  );
}

function messageRecord(
  author: ConversationOperationSigner,
  conversationId: ConversationId,
): Record<string, unknown> {
  const id = MessageId.generate().valueOf();
  const message = {
    authorId: author.id,
    conversationId: conversationId.valueOf(),
    createdAt: clock++,
    encryptedPayload: 'payload',
    id,
    previousMessageIds: [] as string[],
    scopeType: 'conversation',
    type: 'sent',
  };
  const body = {
    author: {
      deviceCredential: author.deviceCredential,
      identityId: author.id,
    },
    kind: 'put',
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(message),
    predecessor: null as string | null,
    recordId: id,
    sequence: 0,
    store: 'messages',
    version: 1,
  } as const;

  return PublicMutationRecord.withProof(
    message,
    PublicMutationProof.signed(
      body,
      author.deviceKeyPair.sign(PublicMutationProof.signingContentOf(body)),
    ),
  );
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

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-conversations-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  (
    ConversationOperationLimits as unknown as {
      MAX_OPERATIONS_PER_AUTHOR: number;
    }
  ).MAX_OPERATIONS_PER_AUTHOR = QUOTA;
  await startNodes();
  const [honest, malicious, control] = nodes;
  const [owner, alice, bob, carol, dave, erin, gina, mallory, frank, extra] =
    await Promise.all(Array.from({ length: 10 }, () => actor()));

  await connect();
  await synchronization(true);

  stage = 'signed group creation replicates';
  const group = groupGenesis(
    owner,
    [alice, bob, carol, dave],
    'Forgery target',
  );
  const genesis = signConversationOperation({
    action: act('CONVERSATION_CREATED'),
    args: group.args,
    conversationId: group.id.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await honest.repository!.saveOperation(genesis.operation, genesis.proof);
  ledger.push(genesis);
  await converged('group genesis reached every node', group.id);
  const oneToOneId = ConversationId.deterministic(owner.id, erin.id, networkId);
  const oneToOne = signConversationOperation({
    action: act('CONVERSATION_CREATED'),
    args: {
      participantIds: [owner.id, erin.id].sort(),
      type: 'one-to-one',
    },
    conversationId: oneToOneId.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await control.repository!.saveOperation(oneToOne.operation, oneToOne.proof);
  ledger.push(oneToOne);
  await converged('1:1 genesis reached every node', oneToOneId);
  console.log('PASS signed group and 1:1 creation replicated to three nodes');

  stage = 'signed roster changes converge';
  await submit(honest, group.id, owner, 'ADMIN_PROMOTED', {
    identityId: alice.id,
  });
  await converged('promotion reached every node', group.id);
  await submit(control, group.id, owner, 'ADMIN_PROMOTED', {
    identityId: carol.id,
  });
  await converged('second promotion reached every node', group.id);
  await submit(malicious, group.id, alice, 'MEMBER_ADDED', {
    identityId: erin.id,
  });
  await converged('admin add reached every node', group.id);
  await submit(honest, group.id, carol, 'MEMBER_ADDED', {
    identityId: gina.id,
  });
  await converged('second add reached every node', group.id);
  await submit(control, group.id, alice, 'MEMBER_REMOVED', {
    identityId: dave.id,
  });
  await converged('removal reached every node', group.id);
  await submit(honest, group.id, bob, 'MEMBER_LEFT', {});
  await converged('leave reached every node', group.id);
  await submit(malicious, group.id, owner, 'ADMIN_DEMOTED', {
    identityId: carol.id,
  });
  await converged('demotion reached every node', group.id);
  await submit(honest, group.id, owner, 'ADMIN_PROMOTED', {
    identityId: carol.id,
  });
  await converged('re-promotion reached every node', group.id);
  assert.deepEqual(expectedView(group.id), {
    admins: [alice.id, carol.id].sort(),
    creator: owner.id,
    members: [owner.id, alice.id, carol.id, erin.id, gina.id].sort(),
    name: 'Forgery target',
  });
  console.log(
    'PASS signed add, remove, leave, promote and demote converged on every node',
  );

  stage = 'forged conversation operations are ignored';
  const frontier = await malicious.repository!.findFrontier(group.id);
  const forgedOp = (
    signer: ConversationOperationSigner,
    name: Parameters<typeof act>[0],
    args: Record<string, unknown>,
    parents = frontier,
  ): Record<string, unknown> =>
    handmade({
      content: content(signer, name, group.id, args, parents),
      signer,
    });
  const wrongSignature = signConversationOperation({
    action: act('MEMBER_ADDED'),
    args: { identityId: mallory.id },
    conversationId: group.id.valueOf(),
    createdAt: clock++,
    networkId,
    parents: frontier,
    signer: { ...owner, deviceKeyPair: mallory.deviceKeyPair },
  });
  const spoofedGroup = groupGenesis(mallory, [alice], 'Spoofed');
  const hijackNonce = group.nonce;
  const forgeries: Record<string, unknown>[] = [
    // The author is not the identity whose device signed.
    record(wrongSignature),
    // A non member changes the roster.
    forgedOp(mallory, 'MEMBER_ADDED', { identityId: mallory.id }),
    // A plain member adds, removes, promotes.
    forgedOp(erin, 'MEMBER_ADDED', { identityId: frank.id }),
    forgedOp(erin, 'MEMBER_REMOVED', { identityId: gina.id }),
    forgedOp(erin, 'ADMIN_PROMOTED', { identityId: erin.id }),
    forgedOp(gina, 'ADMIN_PROMOTED', { identityId: gina.id }),
    // An admin cannot promote or demote, only the creator can.
    forgedOp(alice, 'ADMIN_PROMOTED', { identityId: gina.id }),
    forgedOp(alice, 'ADMIN_DEMOTED', { identityId: carol.id }),
    // Nobody removes themselves, nobody removes the creator, an admin does not remove an admin.
    forgedOp(gina, 'MEMBER_REMOVED', { identityId: gina.id }),
    forgedOp(alice, 'MEMBER_REMOVED', { identityId: alice.id }),
    forgedOp(alice, 'MEMBER_REMOVED', { identityId: owner.id }),
    forgedOp(carol, 'MEMBER_REMOVED', { identityId: owner.id }),
    forgedOp(alice, 'MEMBER_REMOVED', { identityId: carol.id }),
    // The creator cannot leave.
    forgedOp(owner, 'MEMBER_LEFT', {}),
    // Members that left or were removed cannot come back by themselves.
    forgedOp(bob, 'MEMBER_ADDED', { identityId: bob.id }),
    forgedOp(dave, 'MEMBER_ADDED', { identityId: dave.id }),
    // The creator signs an operation whose parents nobody has.
    forgedOp(owner, 'MEMBER_ADDED', { identityId: frank.id }, [
      PublicMutationProof.digestOf({ parent: 'nobody has this operation' }),
    ]),
    // Arguments above the size limit, really signed by the creator.
    forgedOp(owner, 'MEMBER_ADDED', {
      identityId: frank.id,
      padding: 'x'.repeat(5000),
    }),
    // A genesis claiming the id of the group by someone who did not derive it.
    handmade({
      content: content(
        mallory,
        'CONVERSATION_CREATED',
        group.id,
        {
          name: 'Hijack',
          nonce: hijackNonce,
          participantIds: [mallory.id, alice.id].sort(),
          type: 'group',
        },
        [],
      ),
      signer: mallory,
    }),
    // A genesis whose author is not among its participants.
    handmade({
      content: content(
        mallory,
        'CONVERSATION_CREATED',
        spoofedGroup.id,
        { ...spoofedGroup.args, participantIds: [alice.id, bob.id].sort() },
        [],
      ),
      signer: mallory,
    }),
    // A genesis claiming the deterministic id of the 1:1 of two other identities.
    handmade({
      content: content(
        mallory,
        'CONVERSATION_CREATED',
        oneToOneId,
        { participantIds: [owner.id, erin.id].sort(), type: 'one-to-one' },
        [],
      ),
      signer: mallory,
    }),
    // A tombstone and a replay of an honest operation under another scope.
    {
      conversationId: group.id.valueOf(),
      deleted: true,
      id: `conversation:${group.id.valueOf()}:forged:tombstone`,
      networkId,
      removed: true,
      updatedAt: Date.now() + 10 ** 12,
    },
    {
      ...record(ledger[2]),
      conversationId: ConversationId.deriveGroup(
        networkId,
        mallory.id,
        'elsewhere',
      ).valueOf(),
    },
  ];
  const forgedIds = forgeries.map((forgery) => forgery.id as string);
  const stored = (await honest.repository!.findOperations(group.id)).length;

  await plant(malicious, group.id, forgeries);
  // The spoofed genesis and the 1:1 hijack are also offered in their own heads.
  await plant(malicious, oneToOneId, [forgeries[forgeries.length - 3]]);
  await reachedRawStores('forged operations', [honest, control], forgeries);
  await pause(3000);
  await assertControlHoldsForged(group.id, control, forgedIds);
  await assertNoForgedOperation('group', group.id, honest);
  await assertNoForgedOperation('1:1', oneToOneId, honest);
  assert.equal(
    (await honest.repository!.findOperations(group.id)).length,
    stored,
    'The honest node must hold exactly the honest operations',
  );
  assert.equal(
    await honest.repository!.findMetadataById(
      ConversationId.deriveGroup(networkId, mallory.id, spoofedGroup.nonce),
    ),
    undefined,
    'A spoofed genesis must not create a conversation',
  );
  // Without the gate nothing checks signatures, so the control node adopts the
  // member added with a wrong signature: the attack is real and only the gate stops it.
  assert.ok(
    (await observedView(control, group.id)) &&
      JSON.stringify(await observedView(control, group.id)).includes(
        mallory.id,
      ),
    'The ungated control node must adopt the wrongly signed member',
  );
  const honestIds = idsOf(group.id);

  assert.deepEqual(
    (await control.repository!.findOperations(group.id))
      .map((operation) => operation.getId())
      .filter((operationId) => honestIds.has(operationId))
      .sort(),
    [...honestIds].sort(),
    'The honest operations are a subset of what the control node holds',
  );
  console.log(
    'PASS forged signatures, non-member and plain-member changes, self removal, creator removal, admin removal, creator leave, rejoin, unknown parents, oversized arguments, spoofed genesis, tombstone and cross-scope replay rejected by the gated node while the ungated node replicated them',
  );

  stage = 'one-to-one is immutable';
  const oneToOneForged = [
    handmade({
      content: content(
        owner,
        'MEMBER_ADDED',
        oneToOneId,
        { identityId: frank.id },
        await honest.repository!.findFrontier(oneToOneId),
      ),
      signer: owner,
    }),
    handmade({
      content: content(
        erin,
        'MEMBER_LEFT',
        oneToOneId,
        {},
        await honest.repository!.findFrontier(oneToOneId),
      ),
      signer: erin,
    }),
    handmade({
      content: content(
        owner,
        'ADMIN_PROMOTED',
        oneToOneId,
        { identityId: erin.id },
        await honest.repository!.findFrontier(oneToOneId),
      ),
      signer: owner,
    }),
  ];

  await plant(malicious, oneToOneId, oneToOneForged);
  await reachedRawStores('1:1 operations', [honest, control], oneToOneForged);
  await pause(3000);
  await assertControlHoldsForged(
    oneToOneId,
    control,
    oneToOneForged.map((forgery) => forgery.id as string),
  );
  await assertNoForgedOperation('1:1 after genesis', oneToOneId, honest);
  assert.deepEqual(
    (await honest.repository!.findMetadataById(oneToOneId))?.toPrimitives()
      .participantIds,
    [owner.id, erin.id].sort(),
  );
  console.log('PASS operations on a 1:1 after its genesis rejected');

  stage = 'author quota';
  const crowded = groupGenesis(owner, [alice], 'Crowded');
  const crowdedGenesis = signConversationOperation({
    action: act('CONVERSATION_CREATED'),
    args: crowded.args,
    conversationId: crowded.id.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: owner,
  });

  await honest.repository!.saveOperation(
    crowdedGenesis.operation,
    crowdedGenesis.proof,
  );
  ledger.push(crowdedGenesis);
  await converged('crowded genesis reached every node', crowded.id);
  await submit(honest, crowded.id, owner, 'ADMIN_PROMOTED', {
    identityId: alice.id,
  });
  await converged('crowded promotion reached every node', crowded.id);
  // The 31st operation of a non creator is the one over the quota.
  let parents = await malicious.repository!.findFrontier(crowded.id);
  const quotaOperations: SignedConversationOperation[] = [];

  for (let index = 0; index <= QUOTA; index++) {
    const signed = signConversationOperation({
      action: act(index % 2 === 0 ? 'MEMBER_ADDED' : 'MEMBER_REMOVED'),
      args: { identityId: extra.id },
      conversationId: crowded.id.valueOf(),
      createdAt: clock++,
      networkId,
      parents,
      signer: alice,
    });

    quotaOperations.push(signed);
    parents = [signed.operation.getHash()];
  }
  const overQuota = quotaOperations[QUOTA];
  const withinQuota = quotaOperations.slice(0, QUOTA);

  ledger.push(...withinQuota);
  await plant(
    malicious,
    crowded.id,
    quotaOperations.map(record),
    ledger
      .filter((signed) =>
        signed.operation.getConversationId().isEqual(crowded.id),
      )
      .filter((signed) => !quotaOperations.includes(signed))
      .map(record),
  );
  await reachedRawStores(
    'quota operations',
    [honest, control],
    [record(overQuota)],
  );
  await converged('quota operations folded by the honest node', crowded.id, [
    honest,
  ]);
  await pause(3000);
  await assertNoForgedOperation('quota', crowded.id, honest);
  assert.ok(
    !(await honest.repository!.findOperations(crowded.id))
      .map((operation) => operation.getId())
      .includes(overQuota.operation.getId()),
  );
  const controlIds = (await control.repository!.findOperations(crowded.id)).map(
    (operation) => operation.getId(),
  );

  assert.ok(
    controlIds.includes(overQuota.operation.getId()),
    'The ungated node must hold the operation over the quota',
  );
  await assert.rejects(
    honest.repository!.saveOperation(overQuota.operation, overQuota.proof),
    'The honest node must refuse to store an operation over the author quota',
  );
  assert.deepEqual(
    await observedView(control, crowded.id),
    expectedView(crowded.id),
    'The ungated node skips the operation over the quota in its fold too',
  );
  console.log(
    `PASS the operation over the author quota rejected (quota lowered to ${QUOTA} for the run)`,
  );

  stage = 'removed members cannot post messages';
  const accepted = messageRecord(erin, group.id);
  const fromRemoved = messageRecord(dave, group.id);
  const fromLeft = messageRecord(bob, group.id);
  const fromOutsider = messageRecord(mallory, group.id);

  await pause(1200);
  for (const message of [accepted, fromRemoved, fromLeft, fromOutsider])
    await malicious.stores!.messages.put!(message);
  await until('member message visible on the honest node', () =>
    honest.repository!.hasMessage(
      group.id,
      new MessageId(accepted.id as string),
    ),
  );
  await until('forged messages reached the control node', async () => {
    for (const message of [fromRemoved, fromLeft, fromOutsider])
      if (
        !(await control.repository!.hasMessage(
          group.id,
          new MessageId(message.id as string),
        ))
      )
        return false;

    return true;
  });
  await pause(2000);
  for (const message of [fromRemoved, fromLeft, fromOutsider])
    assert.equal(
      await honest.repository!.hasMessage(
        group.id,
        new MessageId(message.id as string),
      ),
      false,
      'A message of a removed, departed or foreign author must not be served',
    );
  console.log(
    'PASS messages of a removed member, a departed member and a non member rejected',
  );
  void frank;
}

const watchdog = setTimeout(() => {
  console.error(`FAIL forged conversations deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged conversations during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
