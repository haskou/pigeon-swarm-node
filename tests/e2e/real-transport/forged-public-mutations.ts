import 'reflect-metadata';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityInvite } from '@app/contexts/communities/domain/entities/invites/CommunityInvite';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import { CommunityInviteNonce } from '@app/contexts/communities/domain/value-objects/CommunityInviteNonce';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import OrbitDBCommunityChannelMessageMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityChannelMessageMapper';
import OrbitDBCommunityInviteMapper from '@app/contexts/communities/infrastructure/orbitdb/mappers/OrbitDBCommunityInviteMapper';
import OrbitDBCommunityChannelMessagePinRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessagePinRepository';
import OrbitDBCommunityChannelMessageRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessageRepository';
import OrbitDBCommunityInviteRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityInviteRepository';
import OrbitDBCommunityModerationLogRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityModerationLogRepository';
import CommunityChannelMessageMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessageMutationPolicy';
import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import CommunityInviteMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInviteMutationPolicy';
import CommunityModerationLogMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityModerationLogMutationPolicy';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import OrbitDBConversationMessagePinRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationMessagePinRepository';
import ConversationMessagePinMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessagePinMutationPolicy';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsPreferences } from '@app/contexts/notification-settings/domain/NotificationScopeSettingsPreferences';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import OrbitDBNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/orbitdb/OrbitDBNotificationScopeSettingsRepository';
import NotificationScopeSettingsMutationPolicy from '@app/contexts/notification-settings/infrastructure/orbitdb/policies/NotificationScopeSettingsMutationPolicy';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import OrbitDBPollRepository from '@app/contexts/polls/infrastructure/orbitdb/OrbitDBPollRepository';
import PollCloseMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollCloseMutationPolicy';
import PollMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollMutationPolicy';
import PollMutationScopeAccess from '@app/contexts/polls/infrastructure/orbitdb/policies/PollMutationScopeAccess';
import PollVoteMutationPolicy from '@app/contexts/polls/infrastructure/orbitdb/policies/PollVoteMutationPolicy';
import PollMutationRecords from '@app/contexts/polls/infrastructure/orbitdb/PollMutationRecords';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
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
import { StickerPack } from '@app/contexts/stickers/domain/StickerPack';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import { StickerPackName } from '@app/contexts/stickers/domain/value-objects/StickerPackName';
import OrbitDBStickerPackRepository from '@app/contexts/stickers/infrastructure/orbitdb/OrbitDBStickerPackRepository';
import OrbitDBStickerUserLibraryRepository from '@app/contexts/stickers/infrastructure/orbitdb/OrbitDBStickerUserLibraryRepository';
import StickerFavoriteMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerFavoriteMutationPolicy';
import StickerPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerPackMutationPolicy';
import StickerRecentMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerRecentMutationPolicy';
import StickerSavedPackMutationPolicy from '@app/contexts/stickers/infrastructure/orbitdb/policies/StickerSavedPackMutationPolicy';
import Kernel from '@haskou/ddd-kernel';
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject, Timestamp } from '@haskou/value-objects';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { teardownAndExit } from './RealTransportTeardown';

type Replica = {
  name: string;
  helia: HeliaInstance;
  orbitdb?: OrbitDBInstance;
  stores?: {
    pins: OrbitDBDatabase;
    requests: OrbitDBDatabase;
    heads: OrbitDBDatabase;
    notificationSettings: OrbitDBDatabase;
    stickerPacks: OrbitDBDatabase;
    stickerUserLibraries: OrbitDBDatabase;
    polls: OrbitDBDatabase;
    messages: OrbitDBDatabase;
    moderationLogs: OrbitDBDatabase;
  };
  registry?: OrbitDBReplicatedStateRegistry;
  pins?: OrbitDBCommunityChannelMessagePinRepository;
  invites?: OrbitDBCommunityInviteRepository;
  conversationPins?: OrbitDBConversationMessagePinRepository;
  settings?: OrbitDBNotificationScopeSettingsRepository;
  stickerPacks?: OrbitDBStickerPackRepository;
  stickerLibraries?: OrbitDBStickerUserLibraryRepository;
  polls?: OrbitDBPollRepository;
  messages?: OrbitDBCommunityChannelMessageRepository;
  moderationLogs?: OrbitDBCommunityModerationLogRepository;
};

const networkId = randomUUID();
const nodes: Replica[] = [];
let stage = 'setup';
let root: string;
const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

async function open(replica: Replica, gate: PublicMutationGate): Promise<void> {
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
    messages: await replica.orbitdb.open(`${networkId}/messages`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
    moderationLogs: await replica.orbitdb.open(`${networkId}/moderationLogs`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
    notificationSettings: await replica.orbitdb.open(
      `${networkId}/notificationSettings`,
      {
        AccessController,
        Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
        sync: false,
        type: 'documents',
      },
    ),
    pins: await replica.orbitdb.open(`${networkId}/pins`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
    polls: await replica.orbitdb.open(`${networkId}/polls`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
    requests: await replica.orbitdb.open(`${networkId}/requests`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
    stickerPacks: await replica.orbitdb.open(`${networkId}/stickerPacks`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
    stickerUserLibraries: await replica.orbitdb.open(
      `${networkId}/stickerUserLibraries`,
      {
        AccessController,
        Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
        sync: false,
        type: 'documents',
      },
    ),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  replica.registry = new OrbitDBReplicatedStateRegistry();
  replica.registry.addMutationGate(gate);
  replica.pins = new OrbitDBCommunityChannelMessagePinRepository(
    replica.registry,
    new PrivateCommunityPublicStorageGuard(
      {
        findScope: (): Promise<undefined> => Promise.resolve(undefined),
      } as never,
      new PrivateAuthorizationStorageCoordinator(),
    ),
  );
  replica.invites = new OrbitDBCommunityInviteRepository(
    replica.registry,
    new OrbitDBCommunityInviteMapper(),
    new PrivateCommunityPublicStorageGuard(
      {
        findScope: (): Promise<undefined> => Promise.resolve(undefined),
      } as never,
      new PrivateAuthorizationStorageCoordinator(),
    ),
  );
  replica.conversationPins = new OrbitDBConversationMessagePinRepository(
    replica.registry,
  );
  replica.settings = new OrbitDBNotificationScopeSettingsRepository(
    replica.registry,
  );
  replica.polls = new OrbitDBPollRepository(
    replica.registry,
    {
      findById: (): Promise<unknown> =>
        Promise.resolve({ toPrimitives: () => ({ networkId }) }),
    } as never,
    {
      findMetadataById: (): Promise<unknown> =>
        Promise.resolve({ toPrimitives: () => ({ networkId }) }),
    } as never,
    new PrivateCommunityPublicStorageGuard(
      {
        findScope: (): Promise<undefined> => Promise.resolve(undefined),
      } as never,
      new PrivateAuthorizationStorageCoordinator(),
    ),
  );
  replica.messages = new OrbitDBCommunityChannelMessageRepository(
    replica.registry,
    new OrbitDBCommunityChannelMessageMapper(),
    new PrivateCommunityPublicStorageGuard(
      {
        findScope: (): Promise<undefined> => Promise.resolve(undefined),
      } as never,
      new PrivateAuthorizationStorageCoordinator(),
    ),
  );
  replica.moderationLogs = new OrbitDBCommunityModerationLogRepository(
    replica.registry,
    new PrivateCommunityPublicStorageGuard(
      {
        findScope: (): Promise<undefined> => Promise.resolve(undefined),
      } as never,
      new PrivateAuthorizationStorageCoordinator(),
    ),
  );
  replica.stickerPacks = new OrbitDBStickerPackRepository(replica.registry);
  replica.stickerLibraries = new OrbitDBStickerUserLibraryRepository(
    replica.registry,
  );
  await replica.registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
  for (const store of Object.values(replica.stores)) await store.sync!.start();
}

async function connect(): Promise<void> {
  const address = nodes[1].helia.libp2p
    .getMultiaddrs()
    .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));
  assert.ok(address, 'Each fixture peer must listen only on loopback');
  await nodes[0].helia.libp2p.dial(
    await heliaRuntimeAdapter.createMultiaddr(address.toString()),
  );
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-forged-mutations-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  const noop = (): void => undefined;
  new Kernel({ logger: { debug: noop, error: noop, info: noop, warn: noop } });
  const key = new PrivateKey(
    generateKeyPairSync('ed25519')
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString(),
  );
  const authorization: PublicMutationAuthorAuthorization = {
    isAuthorized: (claimed) =>
      Promise.resolve(
        claimed.identityId === author && claimed.deviceCredential === author,
      ),
  };
  const community = {
    acceptSentChannelMessage: (): void => undefined,
    assertCanCreateInvite: (): void => undefined,
    assertCanRecordModerationAction: (): void => undefined,
    authorizeTextChannelPollCreation: (): void => undefined,
    authorizeTextChannelPollVote: (): void => undefined,
    manageChannelMessages: (): void => undefined,
    viewTextChannel: (): void => undefined,
  } as unknown as Community;
  const communities = {
    findById: (): Promise<Community> => Promise.resolve(community),
  } as unknown as CommunityRepository;
  const conversations = {
    findMetadataById: (): Promise<Conversation> =>
      Promise.resolve({
        hasParticipant: () => true,
      } as unknown as Conversation),
  } as unknown as ConversationRepository;
  const pollAccess = new PollMutationScopeAccess(communities, conversations);
  const gate = new PublicMutationGate(
    new PublicMutationVerifier(authorization),
    [
      new CommunityChannelMessagePinMutationPolicy(communities),
      new CommunityChannelMessageMutationPolicy(communities),
      new ConversationMessagePinMutationPolicy(conversations),
      new NotificationScopeSettingsMutationPolicy(),
      new CommunityInviteMutationPolicy(communities as never),
      new CommunityModerationLogMutationPolicy(communities as never),
      new PollMutationPolicy(pollAccess),
      new PollVoteMutationPolicy(pollAccess),
      new PollCloseMutationPolicy(pollAccess),
      new StickerPackMutationPolicy(),
      new StickerFavoriteMutationPolicy(),
      new StickerSavedPackMutationPolicy(),
      new StickerRecentMutationPolicy(),
    ],
  );
  const device = await KeyPair.generate();
  const author = new IdentityId(device.toPrimitives().publicKey).valueOf();

  for (const name of ['honest', 'malicious']) {
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
    await open(replica, gate);
  }
  const [honest, malicious] = nodes;
  await connect();

  const communityId = new CommunityId(randomUUID());
  const channelId = new CommunityChannelId(randomUUID());
  const messageId = new CommunityChannelMessageId(randomUUID());
  const id = `community:${communityId.valueOf()}:${channelId.valueOf()}:${messageId.valueOf()}`;
  const base = {
    channelId: channelId.valueOf(),
    communityId: communityId.valueOf(),
    id,
    messageId: messageId.valueOf(),
    pinnedByIdentityId: author,
    scopeType: 'community_channel',
  };
  const proof = (
    kind: 'put' | 'delete',
    sequence: number,
    payload: Record<string, unknown>,
  ): PublicMutationProof => {
    const body = {
      author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-e2e-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: id,
      sequence,
      store: 'pins',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    );
  };
  const listed = async (replica: Replica): Promise<number> =>
    (await replica.pins!.findByChannel(communityId, channelId)).length;
  const identity = new IdentityId(author);

  stage = 'signed pin replicates';
  await honest.pins!.pin(
    communityId,
    channelId,
    messageId,
    identity,
    new Timestamp(1780000000000),
    proof('put', 0, { ...base, createdAt: 1780000000000 }),
  );
  await until('pin visible on the honest replica', async () => {
    return (await listed(honest)) === 1;
  });
  await until('pin reached the malicious replica store', async () => {
    const stored = await malicious.stores!.pins.query!(
      (record) => record.id === id,
    );

    return stored.length === 1;
  });
  console.log('PASS signed pin replicated between two real nodes');

  stage = 'forged future-dated tombstone is ignored';
  const forged = { ...base, removed: true, updatedAt: Date.now() + 10 ** 12 };
  await malicious.stores!.pins.put!(forged);
  await malicious.stores!.heads.put!(
    `community-channel-pin-index:${communityId.valueOf()}:${channelId.valueOf()}`,
    {
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      id: `community-channel-pin-index:${communityId.valueOf()}:${channelId.valueOf()}`,
      pins: [forged],
      updatedAt: Date.now() + 10 ** 12,
    },
  );
  await until('forged tombstone reached the honest raw store', async () => {
    const stored = await honest.stores!.pins.query!(
      (record) => record.id === id && record.removed === true,
    );

    return stored.length === 1;
  });
  await pause(1500);
  assert.equal(
    await listed(honest),
    1,
    'forged tombstone must not remove the pin',
  );
  console.log('PASS forged future-dated tombstone rejected by the honest node');

  stage = 'signed removal converges';
  const tombstone = { ...base, removed: true };
  await honest.pins!.unpin(
    communityId,
    channelId,
    messageId,
    identity,
    proof('delete', 1, tombstone),
  );
  await until('signed removal applied', async () => {
    return (await listed(honest)) === 0;
  });
  console.log('PASS legitimate signed removal applied');

  stage = 'stale replay is refused';
  await assert.rejects(
    honest.pins!.pin(
      communityId,
      channelId,
      messageId,
      identity,
      new Timestamp(1780000000000),
      proof('put', 0, { ...base, createdAt: 1780000000000 }),
    ),
    /ublic mutation|tale/i,
  );
  assert.equal(await listed(honest), 0);
  console.log('PASS replayed older put proof refused after removal');

  stage = 'conversation pins are governed too';
  const conversationId = new ConversationId(`one-to-one:${randomUUID()}`);
  const conversationMessageId = new MessageId(randomUUID());
  const conversationPinId = `conversation:${conversationId.valueOf()}:${conversationMessageId.valueOf()}`;
  const conversationBase = {
    conversationId: conversationId.valueOf(),
    id: conversationPinId,
    messageId: conversationMessageId.valueOf(),
    pinnedByIdentityId: author,
    scopeType: 'conversation',
  };
  const conversationProof = (
    kind: 'put' | 'delete',
    sequence: number,
    payload: Record<string, unknown>,
  ): PublicMutationProof => {
    const body = {
      author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-conv-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: conversationPinId,
      sequence,
      store: 'pins',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    );
  };
  const conversationPinCount = async (replica: Replica): Promise<number> =>
    (await replica.conversationPins!.findByConversation(conversationId)).length;

  await honest.conversationPins!.pin(
    conversationId,
    conversationMessageId,
    identity,
    new Timestamp(1780000000000),
    conversationProof('put', 0, {
      ...conversationBase,
      createdAt: 1780000000000,
    }),
  );
  await until('conversation pin visible on the honest replica', async () => {
    return (await conversationPinCount(honest)) === 1;
  });
  await until('conversation pin reached the malicious store', async () => {
    const stored = await malicious.stores!.pins.query!(
      (record) => record.id === conversationPinId,
    );

    return stored.length === 1;
  });
  await malicious.stores!.pins.put!({
    ...conversationBase,
    removed: true,
    updatedAt: Date.now() + 10 ** 12,
  });
  await until('forged conversation tombstone reached honest', async () => {
    const stored = await honest.stores!.pins.query!(
      (record) => record.id === conversationPinId && record.removed === true,
    );

    return stored.length === 1;
  });
  await pause(1500);
  assert.equal(
    await conversationPinCount(honest),
    1,
    'forged tombstone must not remove the conversation pin',
  );
  console.log('PASS forged conversation tombstone rejected by the honest node');

  await honest.conversationPins!.unpin(
    conversationId,
    conversationMessageId,
    identity,
    conversationProof('delete', 1, { ...conversationBase, removed: true }),
  );
  await until('signed conversation removal applied', async () => {
    return (await conversationPinCount(honest)) === 0;
  });
  await assert.rejects(
    honest.conversationPins!.pin(
      conversationId,
      conversationMessageId,
      identity,
      new Timestamp(1780000000000),
      conversationProof('put', 0, {
        ...conversationBase,
        createdAt: 1780000000000,
      }),
    ),
    /ublic mutation|tale/i,
  );
  console.log('PASS conversation signed removal applied, replay refused');

  stage = 'notification settings are governed too';
  const settingsScope = NotificationSettingScope.community(
    new CommunityId(randomUUID()),
  );
  const settingsId = `${author}:${settingsScope.key()}`;
  const settingsProof = (
    kind: 'put' | 'delete',
    sequence: number,
    payload: Record<string, unknown>,
  ): PublicMutationProof => {
    const body = {
      author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-settings-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: settingsId,
      sequence,
      store: 'notificationSettings',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    );
  };
  const settings = NotificationScopeSettings.create(
    identity,
    settingsScope,
    NotificationScopeSettingsPreferences.defaults(),
    new Timestamp(1780000000000),
  );
  const settingsTombstone = {
    id: settingsId,
    identityId: author,
    removed: true,
    scopeKey: settingsScope.key(),
    scopeType: 'notification_settings',
  };
  const settingsCount = async (replica: Replica): Promise<number> =>
    (await replica.settings!.findByIdentityId(identity)).length;

  await honest.settings!.save(
    settings,
    settingsProof('put', 0, {
      ...settings.toPrimitives(),
      id: settingsId,
      scopeType: 'notification_settings',
    }),
  );
  await until('settings reached the malicious store', async () => {
    const stored = await malicious.stores!.notificationSettings.query!(
      (record) => record.id === settingsId,
    );

    return stored.length === 1;
  });
  await malicious.stores!.notificationSettings.put!({
    ...settingsTombstone,
    updatedAt: Date.now() + 10 ** 12,
  });
  await until('forged settings tombstone reached honest', async () => {
    const stored = await honest.stores!.notificationSettings.query!(
      (record) => record.id === settingsId && record.removed === true,
    );

    return stored.length === 1;
  });
  await pause(1500);
  assert.equal(
    await settingsCount(honest),
    1,
    'forged tombstone must not reset the notification settings',
  );
  console.log('PASS forged settings tombstone rejected by the honest node');

  await honest.settings!.delete(
    identity,
    settingsScope,
    settingsProof('delete', 1, settingsTombstone),
  );
  await until('signed settings reset applied', async () => {
    return (await settingsCount(honest)) === 0;
  });
  console.log('PASS settings signed reset applied');

  stage = 'community invites are governed too';
  const inviteCommunityId = new CommunityId(randomUUID());
  const invite = CommunityInvite.create(
    inviteCommunityId,
    identity,
    new CommunityInviteNonce(randomUUID().replace(/-/g, '')),
    new Timestamp(1780000000000),
    undefined,
    new CommunityInviteMaxUses(1),
  );
  const inviteToken = invite.getToken();
  const invitePayload = new OrbitDBCommunityInviteMapper().toPayload(invite);
  const inviteProof = (
    kind: 'put' | 'delete',
    sequence: number,
    payload: Record<string, unknown>,
  ): PublicMutationProof => {
    const body = {
      author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-invite-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: inviteToken.valueOf(),
      sequence,
      store: 'requests',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    );
  };

  await honest.invites!.save(invite, inviteProof('put', 0, invitePayload));
  await until('invite reached the malicious store', async () => {
    const stored = await malicious.stores!.requests.query!(
      (record) => record.id === inviteToken.valueOf(),
    );

    return stored.length === 1;
  });
  await malicious.stores!.requests.put!({
    ...invitePayload,
    maxUses: 9999,
  });
  await pause(3000);
  assert.equal(
    (await honest.invites!.findByToken(inviteToken))?.toPrimitives().maxUses,
    1,
    'forged unsigned invite rewrite must be ignored',
  );
  console.log('PASS forged invite rewrite rejected by the honest node');

  stage = 'moderation logs are governed too';
  const logCommunityId = new CommunityId(randomUUID());
  const logEntry = CommunityModerationLogEntry.create(
    logCommunityId,
    identity,
    CommunityModerationAction.MEMBER_BANNED,
    CommunityModerationTarget.create(
      new CommunityModerationTargetType('member'),
      new StringValueObject('banned-identity'),
    ),
    new CommunityModerationLogDetails({ reason: 'spam' }),
    new Timestamp(1780000000000),
  );
  const logPayload = {
    ...logEntry.toPrimitives(),
    scopeType: 'community_moderation_log',
  };
  const logBody = {
    author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
    kind: 'put',
    operationId: 'forged-moderation-log-0'.padEnd(22, '0'),
    payloadDigest: PublicMutationProof.digestOf(logPayload),
    predecessor: null as string | null,
    recordId: logPayload.id,
    sequence: 0,
    store: 'moderationLogs',
    version: 2,
  } as const;
  const logProof = PublicMutationProof.signed(
    logBody,
    device.sign(PublicMutationProof.signingContentOf(logBody)),
  );
  const loggedReason = async (replica: Replica): Promise<unknown[]> =>
    (await replica.moderationLogs!.findByCommunity(logCommunityId, 10)).map(
      (entry) => entry.toPrimitives().details.reason,
    );

  await honest.moderationLogs!.save(logEntry, logProof);
  await until('moderation log reached the malicious store', async () => {
    const stored = await malicious.stores!.moderationLogs.query!(
      (record) => record.id === logPayload.id,
    );

    return stored.length === 1;
  });
  await malicious.stores!.moderationLogs.put!({
    ...logPayload,
    details: { reason: 'rewritten history' },
  });
  await malicious.stores!.moderationLogs.put!({
    ...logPayload,
    removed: true,
    updatedAt: Date.now() + 10 ** 12,
  });
  await malicious.stores!.moderationLogs.put!({
    ...logPayload,
    action: 'member_unbanned',
    id: 'forged-unsigned-entry',
  });
  await pause(3000);
  assert.deepEqual(
    await loggedReason(honest),
    ['spam'],
    'forged unsigned moderation log writes must be ignored',
  );
  console.log('PASS forged moderation log writes rejected by the honest node');

  stage = 'polls are governed too';
  const pollScope = PollScope.communityChannel(
    new CommunityId(randomUUID()),
    new CommunityChannelId('channel-1'),
  );
  const poll = Poll.create(
    new PollId('poll-forged-1'),
    identity,
    pollScope,
    new PollQuestion('Which?'),
    [
      PollOption.create(new PollOptionId('a'), new PollOptionText('A')),
      PollOption.create(new PollOptionId('b'), new PollOptionText('B')),
    ],
    new Timestamp(1780000000000),
    { allowsMultipleVotes: false },
  );
  const pollProof = (
    kind: 'put' | 'delete',
    sequence: number,
    recordId: string,
    payload: Record<string, unknown>,
  ): PublicMutationProof => {
    const body = {
      author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-poll-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId,
      sequence,
      store: 'polls',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    );
  };
  const pollId = poll.getId();
  const pollPayload = PollMutationRecords.pollPayload(poll);

  await honest.polls!.save(
    poll,
    pollProof('put', 0, pollId.valueOf(), pollPayload),
  );
  await until('poll reached the malicious store', async () => {
    const stored = await malicious.stores!.polls.query!(
      (record) => record.id === pollId.valueOf(),
    );

    return stored.length === 1;
  });
  const castVote = async (
    from: Poll,
    optionId: string,
    sequence: number,
  ): Promise<void> => {
    from.castVote(
      identity,
      [new PollOptionId(optionId)],
      new Timestamp(1780000000100 + sequence),
    );
    await honest.polls!.saveVote(
      from,
      identity,
      pollProof(
        'put',
        sequence,
        PollMutationRecords.voteId(pollId.valueOf(), author),
        PollMutationRecords.votePayload(from, identity),
      ),
    );
  };
  const voteOf = async (): Promise<string[] | undefined> =>
    (await honest.polls!.findById(pollId))?.toPrimitives().votes[0]?.optionIds;

  await castVote(poll, 'a', 0);
  assert.deepEqual(await voteOf(), ['a']);
  await until('ballot reached the malicious store', async () => {
    const stored = await malicious.stores!.polls.query!(
      (record) => record.scopeType === 'poll_vote',
    );

    return stored.length === 1;
  });
  await malicious.stores!.polls.put!({
    ...PollMutationRecords.votePayload(poll, identity),
    createdAt: 1780000000100,
    optionIds: ['b'],
  });
  await malicious.stores!.polls.put!({
    ...pollPayload,
    question: 'Hijacked?',
  });
  await malicious.stores!.polls.put!({
    ...PollMutationRecords.closePayload(
      poll,
      identity,
      new Timestamp(1780000000050),
    ),
  });
  await pause(3000);
  const afterForgery = (await honest.polls!.findById(pollId))?.toPrimitives();

  assert.deepEqual(afterForgery?.votes[0]?.optionIds, ['a']);
  assert.equal(afterForgery?.question, 'Which?');
  assert.equal(afterForgery?.status, 'open');
  console.log('PASS forged poll records rejected by the honest node');

  await castVote(poll, 'b', 1);
  assert.deepEqual(await voteOf(), ['b']);
  const closedAt = new Timestamp(1780000000900);

  poll.close(closedAt);
  await honest.polls!.saveClose(
    poll,
    identity,
    closedAt,
    pollProof(
      'put',
      0,
      PollMutationRecords.closeId(pollId.valueOf()),
      PollMutationRecords.closePayload(poll, identity, closedAt),
    ),
  );
  assert.equal(
    (await honest.polls!.findById(pollId))?.toPrimitives().status,
    'closed',
  );
  console.log('PASS poll signed ballot and close applied');

  stage = 'community channel messages are governed too';
  const messageCommunityId = new CommunityId(randomUUID());
  const messageChannelId = new CommunityChannelId('channel-messages');
  const message = CommunityChannelMessage.fromPrimitives({
    authorIdentityId: author,
    channelId: messageChannelId.valueOf(),
    communityId: messageCommunityId.valueOf(),
    createdAt: 1780000000000,
    encryptedPayload: 'signed-ciphertext',
    id: 'message-forged-1',
    mentions: [],
    type: 'sent',
  } as never);
  const messageDocument = new OrbitDBCommunityChannelMessageMapper().toDocument(
    message,
  ) as unknown as Record<string, unknown>;
  const messageProof = (
    kind: 'put' | 'delete',
    sequence: number,
    payload: Record<string, unknown>,
  ): PublicMutationProof => {
    const body = {
      author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-message-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: payload.id as string,
      sequence,
      store: 'messages',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    );
  };
  const messageTombstone = {
    authorIdentityId: author,
    channelId: messageChannelId.valueOf(),
    communityId: messageCommunityId.valueOf(),
    id: messageDocument.id as string,
    messageId: 'message-forged-1',
    removed: true,
    scopeType: 'community_channel',
  };
  const storedMessage = (replica: Replica) =>
    replica.messages!.findById(
      messageCommunityId,
      messageChannelId,
      new CommunityChannelMessageId('message-forged-1'),
    );

  await honest.messages!.save(message, messageProof('put', 0, messageDocument));
  await until('message reached the malicious store', async () => {
    const stored = await malicious.stores!.messages.query!(
      (record) => record.id === messageDocument.id,
    );

    return stored.length === 1;
  });
  await malicious.stores!.messages.put!({
    ...messageDocument,
    editedAt: Date.now() + 10 ** 12,
    encryptedPayload: 'forged-ciphertext',
  });
  await malicious.stores!.messages.put!({
    ...messageTombstone,
    updatedAt: Date.now() + 10 ** 12,
  });
  await until('forged message records reached honest', async () => {
    const stored = await honest.stores!.messages.query!(
      (record) => record.removed === true,
    );

    return stored.length === 1;
  });
  await pause(1500);
  const served = await storedMessage(honest);

  assert.notEqual(
    served?.toPrimitives().encryptedPayload,
    'forged-ciphertext',
    'forged edit content must never be served',
  );
  console.log('PASS forged message records rejected by the honest node');

  await honest.messages!.delete(
    messageCommunityId,
    messageChannelId,
    new CommunityChannelMessageId('message-forged-1'),
    identity,
    messageProof('delete', 1, messageTombstone),
  );
  assert.equal(await storedMessage(honest), undefined);
  console.log('PASS message signed removal applied');

  stage = 'stickers are governed too';
  const stickerProof = (
    store: 'stickerPacks' | 'stickerUserLibraries',
    kind: 'put' | 'delete',
    sequence: number,
    payload: Record<string, unknown>,
  ): PublicMutationProof => {
    const body = {
      author: { authorizationRevision: 0, deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-sticker-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: payload.id as string,
      sequence,
      store,
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    );
  };
  const stickerPackId = StickerPackId.generate();
  const stickerId = StickerId.generate();
  const pack = StickerPack.create(
    stickerPackId,
    identity,
    new StickerPackName('Forgery target'),
    new Timestamp(1780000000000),
  );
  const packDocument = { ...pack.toPrimitives(), scopeType: 'sticker_pack' };
  const favoriteId = `favorite:${author}:${stickerPackId.valueOf()}:${stickerId.valueOf()}`;
  const favoriteTombstone = {
    id: favoriteId,
    identityId: author,
    packId: stickerPackId.valueOf(),
    removed: true,
    scopeType: 'sticker_favorite',
    stickerId: stickerId.valueOf(),
  };
  const favoriteCount = async (replica: Replica): Promise<number> =>
    (await replica.stickerLibraries!.findByIdentityId(identity))?.toPrimitives()
      .favoriteStickers.length ?? 0;

  await honest.stickerPacks!.save(
    pack,
    stickerProof('stickerPacks', 'put', 0, packDocument),
  );
  await honest.stickerLibraries!.favorite(
    identity,
    stickerPackId,
    stickerId,
    new Timestamp(1780000000000),
    stickerProof('stickerUserLibraries', 'put', 0, {
      favoritedAt: 1780000000000,
      id: favoriteId,
      identityId: author,
      packId: stickerPackId.valueOf(),
      scopeType: 'sticker_favorite',
      stickerId: stickerId.valueOf(),
    }),
  );
  await until('sticker records reached the malicious store', async () => {
    const packs = await malicious.stores!.stickerPacks.query!(
      (record) => record.id === stickerPackId.valueOf(),
    );
    const favorites = await malicious.stores!.stickerUserLibraries.query!(
      (record) => record.id === favoriteId,
    );

    return packs.length === 1 && favorites.length === 1;
  });
  await malicious.stores!.stickerUserLibraries.put!({
    ...favoriteTombstone,
    updatedAt: Date.now() + 10 ** 12,
  });
  await malicious.stores!.stickerPacks.put!({
    ...packDocument,
    name: 'Hijacked',
    updatedAt: Date.now() + 10 ** 12,
  });
  await malicious.stores!.heads.put!(`sticker-user-library:${author}`, {
    favoriteStickers: [],
    id: `sticker-user-library:${author}`,
    identityId: author,
    recentStickers: [],
    savedPackIds: ['forged'],
  });
  await until('forged sticker records reached honest', async () => {
    const stored = await honest.stores!.stickerUserLibraries.query!(
      (record) => record.id === favoriteId && record.removed === true,
    );

    return stored.length === 1;
  });
  await pause(1500);
  assert.equal(
    await favoriteCount(honest),
    1,
    'forged tombstone must not remove the favorite',
  );
  assert.equal(
    (await honest.stickerPacks!.findById(stickerPackId))?.toPrimitives().name,
    'Forgery target',
    'forged pack document must not replace the signed pack',
  );
  assert.deepEqual(
    (await honest.stickerLibraries!.findByIdentityId(identity))?.toPrimitives()
      .savedPackIds,
    [],
    'forged flat library head must be ignored',
  );
  console.log('PASS forged sticker records rejected by the honest node');

  await honest.stickerLibraries!.unfavorite(
    identity,
    stickerPackId,
    stickerId,
    stickerProof('stickerUserLibraries', 'delete', 1, favoriteTombstone),
  );
  await until('signed unfavorite applied', async () => {
    return (await favoriteCount(honest)) === 0;
  });
  console.log('PASS sticker signed removal applied');
}

const watchdog = setTimeout(() => {
  console.error(`FAIL forged public mutations deadline during ${stage}`);
  process.exit(1);
}, 180000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    console.error(`FAIL forged public mutations during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => teardownAndExit(nodes, root));
