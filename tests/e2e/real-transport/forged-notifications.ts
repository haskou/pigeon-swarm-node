import 'reflect-metadata';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import OrbitDBConversationMessageMapper from '@app/contexts/conversations/infrastructure/orbitdb/mappers/OrbitDBConversationMessageMapper';
import OrbitDBConversationRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationRepository';
import ConversationMessageMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageMutationPolicy';
import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { NotificationReplicationLimits } from '@app/contexts/notifications/domain/NotificationReplicationLimits';
import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import OrbitDBNotificationMapper from '@app/contexts/notifications/infrastructure/orbitdb/mappers/OrbitDBNotificationMapper';
import OrbitDBNotificationRepository from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationRepository';
import NotificationInvitationMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationInvitationMutationPolicy';
import NotificationStateMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationStateMutationPolicy';
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
  invitationPayload,
  NotificationSigner,
  signNotificationInvitation,
  signNotificationRecord,
  signNotificationState,
  statePayload,
} from '../../support/signNotification';
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
    notifications: OrbitDBDatabase;
  };
  registry?: OrbitDBReplicatedStateRegistry;
  conversations?: OrbitDBConversationRepository;
  repository?: OrbitDBNotificationRepository;
  policies?: {
    invitations: NotificationInvitationMutationPolicy;
    states: NotificationStateMutationPolicy;
  };
};

const INVITATION_QUOTA = 3;
const STATE_QUOTA = 2;
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

async function actor(): Promise<NotificationSigner> {
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
    notifications: await documents('notifications'),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  const registry = new OrbitDBReplicatedStateRegistry();
  const conversations = new OrbitDBConversationRepository(
    registry,
    new OrbitDBConversationMessageMapper(),
  );

  const verifier = new PublicMutationVerifier(authorization);

  if (replica.gated) {
    const states = new NotificationStateMutationPolicy(registry, verifier);
    const invitations = new NotificationInvitationMutationPolicy(
      conversations,
      undefined as never,
      registry,
      verifier,
    );

    invitations.limits = new NotificationReplicationLimits(
      INVITATION_QUOTA,
      NotificationReplicationLimits.DEFAULT_MAX_STATES,
    );
    replica.policies = { invitations, states };
    registry.addMutationGate(
      new PublicMutationGate(verifier, [
        new ConversationOperationMutationPolicy(),
        new ConversationMessageMutationPolicy(conversations),
        invitations,
        states,
      ]),
    );
  }
  replica.registry = registry;
  replica.conversations = conversations;
  replica.repository = new OrbitDBNotificationRepository(
    registry,
    new OrbitDBNotificationMapper(),
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
  `notification-e2e-nonce-${String(n).padStart(4, '0')}`;

function invitationNotification(
  inviter: string,
  recipient: string,
  subjectId: string,
  nonce: string,
  key: string,
): Notification {
  return Notification.fromPrimitives({
    id: NotificationId.invitation(
      inviter,
      recipient,
      subjectId,
      nonce,
    ).valueOf(),
    payload: {
      conversationId: subjectId,
      encryptedConversationKey: key,
      inviterIdentityId: inviter,
      nonce,
      recipientIdentityId: recipient,
    },
    recipientIdentityId: recipient,
    state: 'pending',
    status: 'unread',
    type: 'group_conversation_invitation',
  } as never);
}

const stateNotification = (
  base: Notification,
  state: string,
  read: boolean,
): Notification =>
  Notification.fromPrimitives({
    ...(base.toPrimitives() as object),
    state,
    status: read ? 'read' : 'unread',
  } as never);

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-notifications-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  await startNodes();
  const [honest, malicious, control] = nodes;
  const [owner, alice, bob, mallory, outsider, victim] = await Promise.all(
    Array.from({ length: 6 }, () => actor()),
  );

  await connect();
  await synchronization(true);

  stage = 'signed group creation replicates';
  const nonce = randomUUID();
  const group = ConversationId.deriveGroup(networkId, owner.id, nonce);
  const genesis = signConversationOperation({
    action: act('CONVERSATION_CREATED'),
    args: {
      name: 'Invitations',
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

  stage = 'signed invitation and recipient state replicate';
  const subject = group.valueOf();
  const signed = signNotificationInvitation({
    encryptedKey: 'encrypted-key-for-bob',
    nonce: NONCE(1),
    recipientIdentityId: bob.id,
    signer: owner,
    subjectId: subject,
    type: 'group_conversation_invitation',
  });
  const invitation = invitationNotification(
    owner.id,
    bob.id,
    subject,
    NONCE(1),
    'encrypted-key-for-bob',
  );
  const id = signed.payload.id;

  await honest.repository!.saveInvitation(invitation, signed.proof);
  await until('invitation reached every node', async () => {
    for (const replica of nodes)
      if (!(await replica.repository!.findById(new NotificationId(id))))
        return false;

    return true;
  });
  const accepted = signNotificationState({
    notificationId: id,
    read: true,
    signer: bob,
    state: 'accepted',
  });

  await control.repository!.saveState(
    stateNotification(invitation, 'accepted', true),
    accepted.proof,
  );
  const stateOf = async (replica: Replica): Promise<string | undefined> =>
    (await replica.repository!.findById(new NotificationId(id)))?.toPrimitives()
      .state;

  await until('accepted state reached every node', async () => {
    for (const replica of nodes)
      if ((await stateOf(replica)) !== 'accepted') return false;

    return true;
  });
  console.log(
    'PASS signed invitation and recipient state replicated to three nodes',
  );

  stage = 'forged notification records are ignored';
  const ids: string[] = [];
  const plantRecord = async (
    payload: { id: string } & Record<string, unknown>,
    signer: NotificationSigner,
    sequence = 0,
    predecessor: string | null = null,
  ): Promise<void> => {
    ids.push(payload.id);
    await malicious.stores!.notifications.put!(
      PublicMutationRecord.withProof(
        payload,
        signNotificationRecord(payload, signer, sequence, predecessor),
      ),
    );
  };
  const make = (
    inviter: NotificationSigner,
    recipient: string,
    subjectId: string,
    nonceValue: string,
    key = 'forged-key',
  ) =>
    invitationPayload({
      encryptedKey: key,
      nonce: nonceValue,
      recipientIdentityId: recipient,
      signer: inviter,
      subjectId,
      type: 'group_conversation_invitation',
    });
  const outsiderGroup = ConversationId.deriveGroup(
    networkId,
    mallory.id,
    'x',
  ).valueOf();

  // Forged encryptedKey presented as an invitation from the real owner.
  const asOwner = { ...make(owner, victim.id, subject, NONCE(2)) };
  ids.push(asOwner.id);
  await malicious.stores!.notifications.put!(
    PublicMutationRecord.withProof(
      asOwner,
      signNotificationRecord(asOwner, mallory),
    ),
  );
  // Id that does not derive from the claimed fields.
  const wrongId = {
    ...make(mallory, bob.id, subject, NONCE(3)),
    id: `invitation:${'0'.repeat(64)}`,
  };

  await plantRecord(wrongId, mallory);
  // Inviter not in the conversation.
  await plantRecord(make(mallory, bob.id, subject, NONCE(4)), mallory);
  // Recipient not in the conversation.
  await plantRecord(make(owner, outsider.id, subject, NONCE(5)), owner);
  // Unknown conversation.
  await plantRecord(make(mallory, bob.id, outsiderGroup, NONCE(6)), mallory);
  // State by a non recipient, for the real invitation.
  const byOther = statePayload(id, bob.id, 'pending', true);

  await plantRecord(byOther, mallory);
  // State that leaves the terminal accepted state.
  const out = signNotificationState({
    notificationId: id,
    predecessor: accepted.proof,
    read: true,
    signer: bob,
    state: 'declined',
  });

  ids.push(out.payload.id);
  await malicious.stores!.notifications.put!(
    PublicMutationRecord.withProof(out.payload, out.proof),
  );
  // State for a notification nobody invited anyone with.
  const unknown = `invitation:${'f'.repeat(64)}`;
  const forgedState = signNotificationState({
    notificationId: unknown,
    read: true,
    signer: bob,
    state: 'accepted',
  });

  ids.push(forgedState.payload.id);
  await malicious.stores!.notifications.put!(
    PublicMutationRecord.withProof(forgedState.payload, forgedState.proof),
  );
  // A recipient-index head and a notification head with a mismatching key.
  await malicious.stores!.heads.put!(
    `notification-recipient-index:${victim.id}`,
    {
      id: `notification-recipient-index:${victim.id}`,
      notifications: [asOwner],
      recipientIdentityId: victim.id,
      updatedAt: Date.now() + 10 ** 12,
    },
  );
  await malicious.stores!.heads.put!(`notification:${wrongId.id}-moved`, {
    ...asOwner,
    updatedAt: Date.now() + 10 ** 12,
  });

  const wanted = new Set(ids);

  await until('forged records reached the raw stores', async () => {
    for (const replica of [honest, control]) {
      const stored = await replica.stores!.notifications.query!((value) =>
        wanted.has(value.id as string),
      );

      if (stored.length !== wanted.size) return false;
    }

    return true;
  });
  await pause(3000);

  for (const replica of [honest]) {
    const list = await replica.repository!.findByRecipient(
      new IdentityId(victim.id),
      50,
    );

    assert.deepEqual(
      list,
      [],
      'No forged invitation may be listed for the victim',
    );
    for (const record of ids.filter((value) => value.startsWith('invitation:')))
      assert.equal(
        await replica.repository!.findById(new NotificationId(record)),
        undefined,
        `${record} must not be admitted`,
      );
    for (const other of [bob, outsider, mallory])
      assert.deepEqual(
        (
          await replica.repository!.findByRecipient(
            new IdentityId(other.id),
            50,
          )
        ).map((value) => value.toPrimitives().id),
        other === bob ? [id] : [],
      );
    assert.equal(
      await stateOf(replica),
      'accepted',
      'A terminal state must stay absorbing',
    );
  }
  assert.equal(
    (
      await control.stores!.notifications.query!(
        (value) => value.id === out.payload.id,
      )
    ).length,
    1,
    'The ungated control node must hold the forged transition, otherwise the test proves nothing',
  );
  console.log(
    'PASS forged key under another inviter, id mismatch, inviter or recipient outside the conversation, unknown conversation, state by a non recipient, state out of a terminal state, state of an unknown notification and recipient-index heads rejected',
  );

  stage = 'invitations over the inviter quota are held back';
  // The owner already holds one admitted invitation, plus the validly signed
  // one for a recipient outside the group that the previous stage planted: it
  // is refused for its recipient, yet it still counts against its inviter's
  // own quota. The control node, which has no gate, publishes five more
  // genuine ones, newest id first, so the honest node sees the order that
  // would favour a first-come quota.
  const flood = await Promise.all(
    [10, 11, 12, 13, 14].map(async (index) => {
      const recipient = index % 2 === 0 ? alice : bob;
      const key = `encrypted-key-${index}`;
      const signedInvitation = signNotificationInvitation({
        encryptedKey: key,
        nonce: NONCE(index),
        recipientIdentityId: recipient.id,
        signer: owner,
        subjectId: subject,
        type: 'group_conversation_invitation',
      });

      return {
        id: signedInvitation.payload.id,
        invitation: invitationNotification(
          owner.id,
          recipient.id,
          subject,
          NONCE(index),
          key,
        ),
        proof: signedInvitation.proof,
      };
    }),
  );
  const refused = make(owner, outsider.id, subject, NONCE(5)).id;
  const countedIds = [id, refused, ...flood.map((value) => value.id)].sort();
  const expectedVisible = countedIds
    .slice(0, INVITATION_QUOTA)
    .filter((value) => value !== refused);
  const overQuota = countedIds.slice(INVITATION_QUOTA);

  assert.ok(
    countedIds.length > INVITATION_QUOTA && overQuota.length > 0,
    'The owner must hold more signed invitations than the quota',
  );
  assert.ok(
    expectedVisible.length > 0,
    'The quota must leave at least one invitation visible',
  );
  for (const value of flood.sort((left, right) =>
    left.id < right.id ? 1 : -1,
  ))
    await control.repository!.saveInvitation(value.invitation, value.proof);
  await until('every genuine invitation reached the raw stores', async () => {
    for (const replica of [honest, control]) {
      const stored = await replica.stores!.notifications.query!((value) =>
        countedIds.includes(value.id as string),
      );

      if (stored.length !== countedIds.length) return false;
    }

    return true;
  });
  const visibleIdsOn = async (replica: Replica): Promise<string[]> =>
    (
      await Promise.all(
        [alice, bob].map((recipient) =>
          replica.repository!.findByRecipient(new IdentityId(recipient.id), 50),
        ),
      )
    )
      .flat()
      .map((value) => value.toPrimitives().id)
      .sort();

  await until(
    'honest node keeps exactly the first ids of the quota',
    async () => {
      return (
        JSON.stringify(await visibleIdsOn(honest)) ===
        JSON.stringify(expectedVisible)
      );
    },
  );
  await pause(3000);
  assert.deepEqual(
    await visibleIdsOn(honest),
    expectedVisible,
    'The honest node must expose only the first invitations of the inviter by id',
  );
  for (const hidden of overQuota)
    assert.equal(
      await honest.repository!.findById(new NotificationId(hidden)),
      undefined,
      `${hidden} is over the inviter quota and must not be admitted`,
    );
  assert.deepEqual(
    (await visibleIdsOn(control)).filter((value) => countedIds.includes(value)),
    countedIds.filter((value) => value !== refused),
    'The ungated control node must expose every genuine invitation, otherwise the test proves nothing',
  );
  console.log(
    `PASS ${countedIds.length} signed invitations from one inviter: the honest node admits only the first ${INVITATION_QUOTA} by id whatever order they arrived in`,
  );

  stage = 'recipient states over the recipient quota are held back';
  // Bob already signed three states: the accepted one and two that the
  // forged stage planted (a transition out of a terminal state, and a state
  // for an unknown notification). They are refused, yet they still count
  // against his own quota. Alice invites him three more times and he accepts
  // each one on the ungated control node. With room for two states, at most
  // two of the six can ever be admitted, so at least one of the new ones must
  // be held back whichever way the ids sort.
  honest.policies!.states.limits = new NotificationReplicationLimits(
    INVITATION_QUOTA,
    STATE_QUOTA,
  );
  const invited = [20, 21, 22].map((index) => {
    const key = `encrypted-key-${index}`;
    const signedInvitation = signNotificationInvitation({
      encryptedKey: key,
      nonce: NONCE(index),
      recipientIdentityId: bob.id,
      signer: alice,
      subjectId: subject,
      type: 'group_conversation_invitation',
    });
    const notification = invitationNotification(
      alice.id,
      bob.id,
      subject,
      NONCE(index),
      key,
    );
    const signedState = signNotificationState({
      notificationId: signedInvitation.payload.id,
      read: true,
      signer: bob,
      state: 'accepted',
    });

    return {
      id: signedInvitation.payload.id,
      invitation: notification,
      invitationProof: signedInvitation.proof,
      state: signedState,
    };
  });

  for (const value of invited)
    await control.repository!.saveInvitation(
      value.invitation,
      value.invitationProof,
    );
  await until('alice invitations reached the honest node', async () => {
    for (const value of invited)
      if (!(await honest.repository!.findById(new NotificationId(value.id))))
        return false;

    return true;
  });
  for (const value of invited)
    await control.repository!.saveState(
      stateNotification(value.invitation, 'accepted', true),
      value.state.proof,
    );
  const bobStateIds = [
    accepted.payload.id,
    out.payload.id,
    forgedState.payload.id,
    ...invited.map((value) => value.state.payload.id),
  ].sort();
  const admittedStateIds = new Set(bobStateIds.slice(0, STATE_QUOTA));
  const heldBack = invited.filter(
    (value) => !admittedStateIds.has(value.state.payload.id),
  );

  assert.ok(
    heldBack.length > 0,
    'At least one new state must fall outside the recipient quota',
  );
  await until('every signed state reached the raw stores', async () => {
    for (const replica of [honest, control]) {
      const stored = await replica.stores!.notifications.query!((value) =>
        bobStateIds.includes(value.id as string),
      );

      if (stored.length !== bobStateIds.length) return false;
    }

    return true;
  });
  await pause(3000);
  for (const value of invited) {
    const expected = admittedStateIds.has(value.state.payload.id)
      ? 'accepted'
      : 'pending';
    const stateOn = async (replica: Replica): Promise<string | undefined> =>
      (
        await replica.repository!.findById(new NotificationId(value.id))
      )?.toPrimitives().state;

    assert.equal(
      await stateOn(honest),
      expected,
      `${value.state.payload.id} must be ${expected} on the honest node`,
    );
    assert.equal(
      await stateOn(control),
      'accepted',
      'The ungated control node must hold every state, otherwise the test proves nothing',
    );
  }
  console.log(
    `PASS ${bobStateIds.length} signed states from one recipient: the honest node admits only the first ${STATE_QUOTA} by id, ${heldBack.length} of the 3 new ones stay pending`,
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL forged notifications deadline during ${stage}`);
  process.exit(1);
}, 220000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged notifications during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
