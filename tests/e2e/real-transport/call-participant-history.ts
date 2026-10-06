import 'reflect-metadata';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import Kernel from '@haskou/ddd-kernel';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newCallSigner,
  signCallParticipant,
  signCallStart,
} from '../../support/signCall';

const networkId = '550e8400-e29b-41d4-a716-446655440002';

async function project(
  stores: OrbitDBPrivateNetworkStores,
): Promise<OrbitDBCallProjection> {
  const registry = new OrbitDBReplicatedStateRegistry();

  await registry.register(networkId, stores);
  const projection = new OrbitDBCallProjection(registry);

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
  const creator = await newCallSigner();
  const peer = await newCallSigner();
  const createdAt = Date.now() - 60_000;
  const start = signCallStart({
    networkId,
    nonce: 'call-history-nonce-0001',
    participantIds: [creator.id, peer.id].sort(),
    scope: { conversationId: 'one-to-one:history', type: 'conversation' },
    signer: creator,
    startedAt: createdAt,
  });
  const statuses = (
    call:
      { participants: { identityId: string; status: string }[] } | undefined,
  ): Record<string, string> =>
    Object.fromEntries(
      (call?.participants ?? []).map((p) => [p.identityId, p.status]),
    );
  let stores: OrbitDBPrivateNetworkStores | undefined;
  try {
    stores = await OrbitDBPrivateNetworkStores.open(network);
    await stores.calls.put!(
      PublicMutationRecord.withProof(start.payload, start.proof),
    );
    // Creator leaves and rejoins; the peer joins: both end joined.
    const left = signCallParticipant({
      at: createdAt + 100,
      callId: start.callId,
      signer: creator,
      state: 'left',
    });
    const rejoined = signCallParticipant({
      at: createdAt + 200,
      callId: start.callId,
      predecessor: left.proof,
      signer: creator,
      state: 'joined',
    });
    const peerJoined = signCallParticipant({
      at: createdAt + 210,
      callId: start.callId,
      signer: peer,
      state: 'joined',
    });

    for (const record of [left, rejoined, peerJoined])
      await stores.calls.put!(
        PublicMutationRecord.withProof(record.payload, record.proof),
      );
    const expected = { [creator.id]: 'joined', [peer.id]: 'joined' };
    const projection = await project(stores);
    const first = await projection.findById(new CallId(start.callId));

    assert.deepEqual(statuses(first), expected);

    await stores.stop();
    stores = await OrbitDBPrivateNetworkStores.open(network);
    const reopened = await project(stores);

    assert.deepEqual(
      statuses(await reopened.findById(new CallId(start.callId))),
      expected,
      'A fresh projection must recover both rejoins from the OrbitDB log history',
    );
    console.log('PASS: signed conversation rejoins retained after reopen');
  } finally {
    await stores?.stop();
    await rm(root, { force: true, recursive: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
