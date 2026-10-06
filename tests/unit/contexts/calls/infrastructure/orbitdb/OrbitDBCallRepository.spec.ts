import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallNonce } from '@app/contexts/calls/domain/value-objects/CallNonce';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import {
  CallSigner,
  newCallSigner,
  signCallEnd,
  signCallParticipant,
  signCallStart,
} from '../../../../../support/signCall';

type UpdateHandler = (entry: { payload?: { value?: unknown } }) => void;

function createStore() {
  const entries = new Map<string, Record<string, unknown>>();
  const updateHandlers: UpdateHandler[] = [];

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    events: {
      on: jest.fn((event: string, handler: UpdateHandler) => {
        if (event === 'update') updateHandlers.push(handler);
      }),
    },
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(async (document: Record<string, unknown>) => {
      entries.set(String(document.id), document);
      for (const handler of updateHandlers) {
        handler({ payload: { value: document } });
      }

      return String(document.id);
    }),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('OrbitDBCallRepository', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440002';
  const communityId = new CommunityId('community-1');
  const channelId = new CommunityChannelId('channel-1');
  const now = () => Date.now();
  let creator: CallSigner;
  let peer: CallSigner;
  let calls: ReturnType<typeof createStore>;
  let projection: OrbitDBCallProjection;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCallRepository;
  let leases: InMemoryCallParticipantLeaseRepository;
  let nonceSeed = 0;

  const nonce = () => `repo-spec-nonce-${String(++nonceSeed).padStart(8, '0')}`;

  const guard = () =>
    new PrivateCommunityPublicStorageGuard(
      { findScope: jest.fn().mockResolvedValue(undefined) } as never,
      new PrivateAuthorizationStorageCoordinator(),
    );

  async function build(start = true): Promise<void> {
    calls = createStore();
    registry = new OrbitDBReplicatedStateRegistry();
    await registry.register(networkId, {
      calls,
      heads: createStore(),
    } as never);
    projection = new OrbitDBCallProjection(registry);
    leases = new InMemoryCallParticipantLeaseRepository();
    repository = new OrbitDBCallRepository(
      registry,
      projection,
      leases,
      guard(),
    );
    if (start) await projection.start();
  }

  const conversationStart = (startedAt = now()) =>
    signCallStart({
      networkId,
      nonce: nonce(),
      participantIds: [creator.id, peer.id],
      scope: { conversationId: 'one-to-one:repo-spec', type: 'conversation' },
      signer: creator,
      startedAt,
    });

  const communityStart = (sessionEpoch = 1, startedAt = now()) =>
    signCallStart({
      networkId,
      nonce: nonce(),
      scope: {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        type: 'community_channel',
      },
      sessionEpoch,
      signer: creator,
      startedAt,
    });

  /** Writes a record as a replicated one: OrbitDB tells the projection. */
  async function replicate(
    payload: Record<string, unknown>,
    proof: Parameters<typeof PublicMutationRecord.withProof>[1],
  ): Promise<void> {
    await calls.put(PublicMutationRecord.withProof(payload, proof));
    await flush();
  }

  beforeAll(async () => {
    creator = await newCallSigner();
    peer = await newCallSigner();
  });

  beforeEach(async () => {
    await build();
  });

  afterEach(() => {
    registry.clear();
  });

  it('rejects reads until the stored records have been projected', async () => {
    await build(false);

    await expect(
      repository.findById(new CallId('550e8400-e29b-41d4-a716-446655440001')),
    ).rejects.toThrow();
  });

  it('stores the start as a proven record and derives the call from it', async () => {
    const { callId, payload, proof } = conversationStart();
    const call = Call.start(
      new IdentityId(creator.id),
      new NetworkId(networkId),
      CallScope.conversation(new ConversationId('one-to-one:repo-spec')),
      [new IdentityId(peer.id)],
      new CallNonce(payload.nonce as string),
      new Timestamp(payload.startedAt as number),
    );

    await repository.saveStart(call, proof);
    await flush();

    expect(calls.put).toHaveBeenCalledTimes(1);
    const stored = calls.put.mock.calls[0][0] as Record<string, unknown>;
    expect(stored).toMatchObject({
      callId,
      id: `call:${callId}`,
      scopeType: 'call_start',
    });
    expect(PublicMutationRecord.proofOf(stored)).toBeDefined();
    const found = await repository.findById(new CallId(callId));
    expect(found?.isActive()).toBe(true);
    expect(found?.getParticipantIds().map((id) => id.valueOf())).toEqual(
      expect.arrayContaining([creator.id, peer.id]),
    );
  });

  it('folds replicated participant and end records into the call state', async () => {
    const start = conversationStart();
    const accepted = signCallParticipant({
      at: now() + 1,
      callId: start.callId,
      signer: peer,
      state: 'joined',
    });

    await replicate(start.payload, start.proof);
    await replicate(accepted.payload, accepted.proof);

    let found = await repository.findById(new CallId(start.callId));
    expect(found?.hasJoinedParticipant(new IdentityId(peer.id))).toBe(true);

    const end = signCallEnd({
      at: now() + 2,
      callId: start.callId,
      signer: creator,
    });
    await replicate(end.payload, end.proof);

    found = await repository.findById(new CallId(start.callId));
    expect(found?.isActive()).toBe(false);
    await expect(
      repository.findActiveByParticipant(new IdentityId(creator.id)),
    ).resolves.toEqual([]);
  });

  it('ignores a participant or end record that arrives before its start, then applies it', async () => {
    const start = conversationStart();
    const joined = signCallParticipant({
      at: now() + 1,
      callId: start.callId,
      signer: peer,
      state: 'joined',
    });

    await replicate(joined.payload, joined.proof);
    await expect(
      repository.findById(new CallId(start.callId)),
    ).resolves.toBeUndefined();

    await replicate(start.payload, start.proof);
    const found = await repository.findById(new CallId(start.callId));
    expect(found?.hasJoinedParticipant(new IdentityId(peer.id))).toBe(true);
  });

  it('marks a ringing call missed locally without writing a replicated record', async () => {
    const start = conversationStart(now() - 120_000);
    await replicate(start.payload, start.proof);
    const writes = calls.put.mock.calls.length;
    const [timedOut] = await repository.findTimedOutRingingCalls(
      new Timestamp(now() - 60_000),
    );

    expect(timedOut.getId().valueOf()).toBe(start.callId);
    timedOut.markTimedOut(new Timestamp(now()));
    await repository.markTimedOut(timedOut);

    expect(calls.put.mock.calls.length).toBe(writes);
    const found = await repository.findById(new CallId(start.callId));
    expect(found?.toPrimitives().status).toBe('missed');
  });

  it('ends a call that outlived the maximum duration on every read', async () => {
    const start = conversationStart(now() - 13 * 60 * 60 * 1000);
    await replicate(start.payload, start.proof);

    const found = await repository.findById(new CallId(start.callId));
    expect(found?.isActive()).toBe(false);
  });

  it('keeps one live call per community channel: the lowest digest wins', async () => {
    const first = communityStart(1);
    const other = await newCallSigner();
    const rival = signCallStart({
      networkId,
      nonce: nonce(),
      scope: {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        type: 'community_channel',
      },
      sessionEpoch: 1,
      signer: other,
      startedAt: now(),
    });

    await replicate(first.payload, first.proof);
    await replicate(rival.payload, rival.proof);

    const winnerId =
      (first.proof.toPrimitives() as { payloadDigest: string }).payloadDigest <
      (rival.proof.toPrimitives() as { payloadDigest: string }).payloadDigest
        ? first.callId
        : rival.callId;
    const loserId = winnerId === first.callId ? rival.callId : first.callId;

    const loser = await repository.findById(new CallId(loserId));
    expect(loser?.isActive()).toBe(false);
    const winner = await repository.findById(new CallId(winnerId));
    expect(winner?.toPrimitives().status).toBe('active');
  });
});
