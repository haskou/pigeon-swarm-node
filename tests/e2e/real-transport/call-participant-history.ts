import 'reflect-metadata';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { OrbitDBCallDocument } from '@app/contexts/calls/infrastructure/orbitdb/documents/OrbitDBCallDocument';
import OrbitDBCallDocumentMerger from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentMerger';
import OrbitDBCallDocumentReplicator from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentReplicator';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const creatorIdentityId =
  'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
const participantIdentityId =
  'MCowBQYDK2VwAyEAwRhK+CGU7bzgh7bzBS8SIn3jGiI7i4AqA9KX6niQ2pc=';
const callId = '550e8400-e29b-41d4-a716-446655440001';
const networkId = '550e8400-e29b-41d4-a716-446655440002';
const createdAt = 1_780_000_000_000;

function snapshot(
  rejoinedIdentityId: string,
  updatedAt: number,
): OrbitDBCallDocument {
  return {
    createdAt,
    creatorIdentityId,
    id: callId,
    networkId,
    participantIds: [creatorIdentityId, participantIdentityId],
    participants: [creatorIdentityId, participantIdentityId].map(
      (identityId) =>
        identityId === rejoinedIdentityId
          ? { identityId, joinedAt: updatedAt, status: 'joined' }
          : {
              identityId,
              joinedAt: createdAt,
              leftAt: createdAt + 100,
              status: 'left',
            },
    ),
    scope: {
      channelId: 'channel-1',
      communityId: 'community-1',
      type: 'community_channel',
    },
    status: 'active',
    updatedAt,
  };
}

function assertBothJoined(document: OrbitDBCallDocument | undefined): void {
  assert.ok(document, 'Call must be projected');
  assert.deepEqual(
    document.participants
      .map(({ identityId, joinedAt, status }) => ({
        identityId,
        joinedAt,
        status,
      }))
      .sort((left, right) => (left.identityId < right.identityId ? -1 : 1)),
    [
      {
        identityId: creatorIdentityId,
        joinedAt: createdAt + 200,
        status: 'joined',
      },
      {
        identityId: participantIdentityId,
        joinedAt: createdAt + 210,
        status: 'joined',
      },
    ].sort((left, right) => (left.identityId < right.identityId ? -1 : 1)),
    'Fresh projection must recover both rejoins from the actual OrbitDB log history',
  );
  const call = Call.fromPrimitives(document);
  for (const identityId of [creatorIdentityId, participantIdentityId]) {
    call.assertParticipantCanHeartbeat(new IdentityId(identityId));
  }
}

async function project(
  stores: OrbitDBPrivateNetworkStores,
): Promise<OrbitDBCallProjection> {
  const registry = new OrbitDBReplicatedStateRegistry();
  await registry.register(networkId, stores);
  const projection = new OrbitDBCallProjection(
    registry,
    new OrbitDBCallDocumentMerger(),
    new OrbitDBCallDocumentReplicator(registry),
  );
  await projection.start();

  return projection;
}

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'pigeon-call-history-'));
  process.env.IPFS_STORAGE_PATH = root;
  process.env.NODE_ENV = 'test';
  const noop = (): void => undefined;
  new Kernel({ logger: { debug: noop, error: noop, info: noop, warn: noop } });
  const blocks = new Map<string, Uint8Array>();
  const ipfs = {
    blockstore: {
      async *get(cid: { toString(): string }): AsyncGenerator<Uint8Array> {
        const bytes = blocks.get(cid.toString());
        assert.ok(bytes, `Unexpected missing block: ${cid.toString()}`);
        yield bytes;
      },
      put(cid: { toString(): string }, bytes: Uint8Array): Promise<void> {
        blocks.set(cid.toString(), bytes);

        return Promise.resolve();
      },
    },
    libp2p: {
      getPeers: (): never[] => [],
      peerId: 'offline-call-history-peer',
      services: { pubsub: {} },
    },
    pins: { isPinned: (): Promise<boolean> => Promise.resolve(true) },
  };
  const network = {
    getHeliaCore: (): typeof ipfs => ipfs,
    getId: (): string => networkId,
    getPeerId: (): string => 'offline-call-history-peer',
  } as unknown as IPFSNetwork;
  let stores: OrbitDBPrivateNetworkStores | undefined;
  try {
    stores = await OrbitDBPrivateNetworkStores.open(network);
    const first = snapshot(creatorIdentityId, createdAt + 200);
    const second = snapshot(participantIdentityId, createdAt + 210);
    const firstHash = await stores.calls.put!(first);
    await stores.calls.put!(second);
    const heads = await stores.calls.log!.heads();
    assert.equal(heads.length, 1);
    assert.ok(
      (heads[0] as unknown as { next: string[] }).next.includes(firstHash),
    );
    const canonical = await stores.calls.all!();
    assert.equal(canonical.length, 1);
    assert.deepEqual(canonical[0].value, second);

    const projection = await project(stores);
    assertBothJoined(await projection.findById(new CallId(callId)));

    const deadline = Date.now() + 2000;
    let persisted: OrbitDBCallDocument | undefined;
    do {
      const record = (await stores.calls.get!(callId)) as
        { value: OrbitDBCallDocument } | undefined;
      persisted = record?.value;

      if (
        persisted?.participants.every(
          (participant) => participant.status === 'joined',
        )
      )
        break;
      await new Promise<void>((resolve) => setImmediate(resolve));
    } while (Date.now() < deadline);
    assertBothJoined(persisted);

    await stores.stop();
    stores = await OrbitDBPrivateNetworkStores.open(network);
    const reopened = await project(stores);
    assertBothJoined(await reopened.findById(new CallId(callId)));
    console.log(
      'PASS: ancestor rejoin recovered, repaired document persisted, and fresh reopen retained both joined participants',
    );
  } finally {
    await stores?.stop();
    await rm(root, { force: true, recursive: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
