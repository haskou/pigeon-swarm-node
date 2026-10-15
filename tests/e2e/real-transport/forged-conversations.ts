import 'reflect-metadata';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
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
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { legacyGroupChange } from '../../support/legacyGroupChange';
import { legacyGroupGenesis } from '../../support/legacyGroupGenesis';
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
  };
  registry?: OrbitDBReplicatedStateRegistry;
  repository?: OrbitDBConversationRepository;
};

type Hand = {
  content: Record<string, unknown>;
  signer: ConversationOperationSigner;
};

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
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();
  const repository = new OrbitDBConversationRepository(registry);

  if (replica.gated)
    registry.addMutationGate(
      new PublicMutationGate(new PublicMutationVerifier(authorization), [
        new ConversationOperationMutationPolicy(),
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
  creatorId: string;
  participantIds: string[];
}): unknown => ({
  creator: value.creatorId,
  members: [...value.participantIds].sort(),
});

function expectedView(id: ConversationId): unknown {
  const roster = expectedOf(id).roster;

  if (!roster) return undefined;

  return viewOf({
    creatorId: roster.getCreator(),
    participantIds: roster.getMembers(),
  });
}

async function observedView(
  replica: Replica,
  id: ConversationId,
): Promise<unknown> {
  if (!(await replica.repository!.hasById(id))) return undefined;

  const conversation = await replica.repository!.requireMetadataById(id);

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
  try {
    await until(label, async () => {
      for (const replica of replicas) {
        if (
          !isDeepStrictEqual(await observedView(replica, id), expectedView(id))
        )
          return false;
      }

      return true;
    });
  } catch (error) {
    console.error(`expected view=${JSON.stringify(expectedView(id))}`);
    throw error;
  }
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
  await startNodes();
  const [honest, malicious, control] = nodes;
  const [owner, alice, erin, mallory, frank] = await Promise.all(
    Array.from({ length: 5 }, () => actor()),
  );

  await connect();
  await synchronization(true);

  stage = 'signed 1:1 creation replicates';
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
  console.log('PASS signed 1:1 creation replicated to three nodes');

  stage = 'a group genesis an older node signed is refused';
  const legacy = legacyGroupGenesis({
    createdAt: clock++,
    creatorIdentityId: owner.id,
    networkId,
    participantIds: [owner.id, alice.id],
  });
  const legacyId = new ConversationId(legacy.conversationId);
  const legacyRecord = PublicMutationRecord.withProof(
    legacy,
    signConversationOperationRecord(legacy, owner),
  );

  await plant(malicious, legacyId, [legacyRecord], []);
  await reachedRawStores(
    'legacy group genesis',
    [honest, control],
    [legacyRecord],
  );
  await pause(3000);
  for (const replica of [honest, control])
    assert.equal(
      await replica.repository!.hasById(legacyId),
      false,
      `${replica.name} must not fold a group genesis into a conversation`,
    );
  console.log(
    'PASS a really signed group genesis replicated to the raw stores and created no conversation on the gated or the ungated node',
  );

  stage = 'forged conversation operations are ignored';
  const ownerFrankId = ConversationId.deterministic(
    owner.id,
    frank.id,
    networkId,
  );
  const wrongSignature = signConversationOperation({
    action: act('CONVERSATION_CREATED'),
    args: {
      participantIds: [owner.id, frank.id].sort(),
      type: 'one-to-one',
    },
    conversationId: ownerFrankId.valueOf(),
    createdAt: clock++,
    networkId,
    parents: [],
    signer: { ...owner, deviceKeyPair: mallory.deviceKeyPair },
  });
  // A genesis claiming the deterministic id of the 1:1 of two other identities.
  const hijack = handmade({
    content: content(
      mallory,
      'CONVERSATION_CREATED',
      oneToOneId,
      { participantIds: [owner.id, erin.id].sort(), type: 'one-to-one' },
      [],
    ),
    signer: mallory,
  });
  const forgeries: Record<string, unknown>[] = [
    hijack,
    // A tombstone and a replay of an honest operation under another scope.
    {
      conversationId: oneToOneId.valueOf(),
      deleted: true,
      id: `conversation:${oneToOneId.valueOf()}:forged:tombstone`,
      networkId,
      removed: true,
      updatedAt: Date.now() + 10 ** 12,
    },
    {
      ...record(oneToOne),
      conversationId: ConversationId.deterministic(
        mallory.id,
        alice.id,
        networkId,
      ).valueOf(),
    },
  ];
  // The author is not the identity whose device signed.
  const wronglySigned = record(wrongSignature);

  await plant(malicious, oneToOneId, forgeries);
  await plant(malicious, ownerFrankId, [wronglySigned], []);
  await reachedRawStores(
    'forged operations',
    [honest, control],
    [...forgeries, wronglySigned],
  );
  await pause(3000);
  await assertControlHoldsForged(oneToOneId, control, [hijack.id as string]);
  await assertNoForgedOperation('1:1', oneToOneId, honest);
  assert.equal(
    await honest.repository!.hasById(ownerFrankId),
    false,
    'A genesis signed by another identity device must not create a conversation',
  );
  // Without the gate nothing checks signatures, so the control node adopts the
  // wrongly signed genesis: the attack is real and only the gate stops it.
  assert.equal(
    await control.repository!.hasById(ownerFrankId),
    true,
    'The ungated control node must adopt the wrongly signed genesis',
  );
  console.log(
    'PASS forged signature, 1:1 hijack, tombstone and cross-scope replay rejected by the gated node while the ungated node replicated them',
  );

  stage =
    'member and admin changes and a parented genesis an older node signed are refused';
  const oneToOneGenesis = ledger.find(
    (signed) =>
      signed.operation.getConversationId().isEqual(oneToOneId) &&
      signed.operation.isGenesis(),
  )!.operation;
  const parents = [oneToOneGenesis.getHash()];
  const legacyChange = (
    signer: ConversationOperationSigner,
    action: string,
    conversationId: ConversationId,
    args: Record<string, unknown>,
    parents: string[],
  ): Record<string, unknown> => {
    const change = legacyGroupChange({
      action,
      args,
      authorIdentityId: signer.id,
      conversationId: conversationId.valueOf(),
      createdAt: clock++,
      networkId,
      parents,
    });

    return PublicMutationRecord.withProof(
      change,
      signConversationOperationRecord(change, signer),
    );
  };
  const oneToOneChanges = [
    legacyChange(
      owner,
      'member_added',
      oneToOneId,
      { identityId: frank.id },
      parents,
    ),
    legacyChange(erin, 'member_left', oneToOneId, {}, parents),
    legacyChange(
      owner,
      'conversation_created',
      oneToOneId,
      { ...oneToOneGenesis.getArguments() },
      parents,
    ),
    legacyChange(
      owner,
      'admin_promoted',
      oneToOneId,
      { identityId: erin.id },
      parents,
    ),
  ];
  const groupChanges = [
    legacyChange(owner, 'member_added', legacyId, { identityId: frank.id }, [
      legacy.id,
    ]),
    legacyChange(owner, 'admin_promoted', legacyId, { identityId: alice.id }, [
      legacy.id,
    ]),
  ];

  await plant(malicious, oneToOneId, oneToOneChanges);
  await plant(malicious, legacyId, groupChanges, [legacyRecord]);
  await reachedRawStores(
    'legacy member and admin changes and a parented genesis',
    [honest, control],
    [...oneToOneChanges, ...groupChanges],
  );
  await pause(3000);
  // The decoder itself refuses these shapes, so even the ungated node keeps
  // them out of its fold. The control node still holds the earlier forgeries
  // it adopted without the gate, so only the honest node must hold nothing
  // but the ledger; both must hold none of these changes.
  const changeIds = new Set(
    [...oneToOneChanges, ...groupChanges].map((change) => change.id as string),
  );

  await assertNoForgedOperation('1:1 after genesis', oneToOneId, honest);
  for (const replica of [honest, control]) {
    assert.deepEqual(
      (await replica.repository!.findOperations(oneToOneId))
        .map((operation) => operation.getId())
        .filter((operationId) => changeIds.has(operationId)),
      [],
      `${replica.name} must not admit a legacy member or admin change`,
    );
    assert.equal(
      await replica.repository!.hasById(legacyId),
      false,
      `${replica.name} must not fold legacy group changes into a conversation`,
    );
    assert.deepEqual(
      (await replica.repository!.requireMetadataById(oneToOneId)).toPrimitives()
        .participantIds,
      [owner.id, erin.id].sort(),
      `${replica.name} must keep the 1:1 participants`,
    );
  }
  console.log(
    'PASS really signed member and admin changes and a parented genesis replicated to the raw stores and changed no conversation on the gated or the ungated node',
  );
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
