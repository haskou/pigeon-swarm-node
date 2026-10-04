import 'reflect-metadata';
import { Community } from '@app/contexts/communities/domain/Community';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBCommunityChannelMessagePinRepository from '@app/contexts/communities/infrastructure/orbitdb/OrbitDBCommunityChannelMessagePinRepository';
import CommunityChannelMessagePinMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityChannelMessagePinMutationPolicy';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import OrbitDBConversationMessagePinRepository from '@app/contexts/conversations/infrastructure/orbitdb/OrbitDBConversationMessagePinRepository';
import ConversationMessagePinMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessagePinMutationPolicy';
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
import Kernel from '@haskou/ddd-kernel';
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
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
  stores?: { pins: OrbitDBDatabase; heads: OrbitDBDatabase };
  registry?: OrbitDBReplicatedStateRegistry;
  pins?: OrbitDBCommunityChannelMessagePinRepository;
  conversationPins?: OrbitDBConversationMessagePinRepository;
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
    pins: await replica.orbitdb.open(`${networkId}/pins`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  replica.registry = new OrbitDBReplicatedStateRegistry();
  replica.registry.useMutationGate(gate);
  replica.pins = new OrbitDBCommunityChannelMessagePinRepository(
    replica.registry,
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
    manageChannelMessages: (): void => undefined,
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
  const gate = new PublicMutationGate(
    new PublicMutationVerifier(authorization),
    [
      new CommunityChannelMessagePinMutationPolicy(communities),
      new ConversationMessagePinMutationPolicy(conversations),
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
      author: { deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-e2e-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: id,
      sequence,
      store: 'pins',
      version: 1,
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
      author: { deviceCredential: author, identityId: author },
      kind,
      operationId: `forged-conv-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId: conversationPinId,
      sequence,
      store: 'pins',
      version: 1,
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
