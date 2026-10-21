import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import { CallNonce } from '@app/contexts/calls/domain/value-objects/CallNonce';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { CallCapabilityHash } from '@app/contexts/calls/domain/value-objects/CallCapabilityHash';
import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  OrbitDBMutationGate,
  OrbitDBMutationVerdict,
} from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

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

/** Rejects every participant record, as a gate that cannot admit a join would. */
class RejectingParticipantGate extends OrbitDBMutationGate {
  public governs(collection: string): boolean {
    return collection === 'calls';
  }

  public async verdictOf(
    _collection: string,
    record: Record<string, unknown>,
  ): Promise<OrbitDBMutationVerdict> {
    return record.scopeType !== 'call_participant' ? 'accepted' : 'refused';
  }

  public governsHead(): boolean {
    return false;
  }

  public async acceptsHead(): Promise<boolean> {
    return true;
  }
}

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
      { hasScope: jest.fn().mockResolvedValue(false) } as never,
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
      repository.requireById(
        new CallId('550e8400-e29b-41d4-a716-446655440001'),
      ),
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
    const found = await repository.requireById(new CallId(callId));
    expect(found.isActive()).toBe(true);
    expect(found.getParticipantIds().map((id) => id.valueOf())).toEqual(
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

    let found = await repository.requireById(new CallId(start.callId));
    expect(found.hasJoinedParticipant(new IdentityId(peer.id))).toBe(true);

    const end = signCallEnd({
      at: now() + 2,
      callId: start.callId,
      signer: creator,
    });
    await replicate(end.payload, end.proof);

    found = await repository.requireById(new CallId(start.callId));
    expect(found.isActive()).toBe(false);
    await expect(
      repository.findActiveByParticipant(new IdentityId(creator.id)),
    ).resolves.toEqual([]);
  });

  describe('holding records of a call whose start it has not projected', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('answers the call as not ready, not as missing, then applies the records to the start', async () => {
      const start = conversationStart();
      const joined = signCallParticipant({
        at: now() + 1,
        callId: start.callId,
        signer: peer,
        state: 'joined',
      });
      const callId = new CallId(start.callId);

      await replicate(joined.payload, joined.proof);
      await expect(repository.hasById(callId)).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );
      await expect(repository.requireById(callId)).rejects.toBeInstanceOf(
        ReplicatedStateNotReadyError,
      );

      await replicate(start.payload, start.proof);
      const found = await repository.requireById(callId);
      expect(found.hasJoinedParticipant(new IdentityId(peer.id))).toBe(true);
    });

    it('answers the call as missing once the bounded wait for its start is over', async () => {
      const start = conversationStart();
      const joined = signCallParticipant({
        at: now() + 1,
        callId: start.callId,
        signer: peer,
        state: 'joined',
      });
      const callId = new CallId(start.callId);

      await replicate(joined.payload, joined.proof);
      await jest.advanceTimersByTimeAsync(OrbitDBCallProjection.START_AWAIT_MS);

      await expect(repository.hasById(callId)).resolves.toBe(false);
      await expect(repository.requireById(callId)).rejects.toBeInstanceOf(
        CallNotFoundError,
      );
    });
  });

  it('answers a call whose start it cannot fold as not ready, not as missing', async () => {
    const callId = '550e8400-e29b-41d4-a716-446655440031';

    await calls.put({
      callId,
      id: `call:${callId}`,
      scope: { type: 'unknown-scope' },
      scopeType: 'call_start',
    });
    await flush();

    await expect(repository.hasById(new CallId(callId))).rejects.toBeInstanceOf(
      ReplicatedStateNotReadyError,
    );
    await expect(
      repository.requireById(new CallId(callId)),
    ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
  });

  describe('listing the calls of a participant', () => {
    it('rejects instead of leaving out a call whose read fails', async () => {
      const start = communityStart();
      await replicate(start.payload, start.proof);
      jest
        .spyOn(leases, 'findByCallIds')
        .mockRejectedValue(new InvalidPrivateAuthorizationError());

      await expect(
        repository.findActiveByParticipant(new IdentityId(creator.id)),
      ).rejects.toBeInstanceOf(InvalidPrivateAuthorizationError);
    });

    it('leaves out only a call of a community verified to be private', async () => {
      const start = communityStart();
      await replicate(start.payload, start.proof);
      await leases.save(
        CallParticipantLease.connect(
          new CallId(start.callId),
          new IdentityId(creator.id),
          new NodeId('550e8400-e29b-41d4-a716-446655440012'),
          new NetworkId(networkId),
          [],
        ),
      );
      const hasScope = jest.fn().mockResolvedValue(true);
      const privateRepository = new OrbitDBCallRepository(
        registry,
        projection,
        leases,
        new PrivateCommunityPublicStorageGuard(
          { hasScope } as never,
          new PrivateAuthorizationStorageCoordinator(),
        ),
      );

      await expect(
        privateRepository.findActiveByParticipant(new IdentityId(creator.id)),
      ).resolves.toEqual([]);
      hasScope.mockRejectedValue(new ReplicatedStateNotReadyError());
      await expect(
        privateRepository.findActiveByParticipant(new IdentityId(creator.id)),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
    });
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
    const found = await repository.requireById(new CallId(start.callId));
    expect(found.toPrimitives().status).toBe('missed');
  });

  it('ends a call that outlived the maximum duration on every read', async () => {
    const start = conversationStart(now() - 13 * 60 * 60 * 1000);
    await replicate(start.payload, start.proof);

    const found = await repository.requireById(new CallId(start.callId));
    expect(found.isActive()).toBe(false);
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

    const loser = await repository.requireById(new CallId(loserId));
    expect(loser.isActive()).toBe(false);
    expect(loser.toPrimitives().supersededByCallId).toBe(winnerId);
    const winner = await repository.requireById(new CallId(winnerId));
    expect(winner.toPrimitives().status).toBe('active');
    expect(winner.toPrimitives().supersededByCallId).toBeUndefined();
  });

  it('names no winner for a community call its creator ended', async () => {
    const start = communityStart();
    const end = signCallEnd({
      at: now() + 1,
      callId: start.callId,
      signer: creator,
    });

    await replicate(start.payload, start.proof);
    await replicate(end.payload, end.proof);

    const ended = await repository.requireById(new CallId(start.callId));
    expect(ended.isActive()).toBe(false);
    expect(ended.toPrimitives().supersededByCallId).toBeUndefined();
  });

  it('verifies but does not store a community participant record', async () => {
    const start = communityStart();
    await replicate(start.payload, start.proof);
    const call = await repository.requireById(new CallId(start.callId));
    const at = now() + 1;
    const joined = signCallParticipant({
      at,
      callId: start.callId,
      signer: peer,
      state: 'joined',
    });
    call.joinOrAdd(new IdentityId(peer.id), new Timestamp(at));
    const writes = calls.put.mock.calls.length;

    await repository.saveParticipant(
      call,
      new IdentityId(peer.id),
      new Timestamp(at),
      joined.proof,
    );

    expect(calls.put.mock.calls.length).toBe(writes);
    expect(calls.put).not.toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: 'call_participant' }),
    );
  });

  it('rejects a community join whose proof the gate does not admit', async () => {
    const start = communityStart();
    await replicate(start.payload, start.proof);
    const call = await repository.requireById(new CallId(start.callId));
    const at = now() + 1;
    const joined = signCallParticipant({
      at,
      callId: start.callId,
      signer: peer,
      state: 'joined',
    });
    call.joinOrAdd(new IdentityId(peer.id), new Timestamp(at));
    registry.addMutationGate(new RejectingParticipantGate());

    await expect(
      repository.saveParticipant(
        call,
        new IdentityId(peer.id),
        new Timestamp(at),
        joined.proof,
      ),
    ).rejects.toBeInstanceOf(InvalidPublicMutationError);
    expect(calls.put).not.toHaveBeenCalledWith(
      expect.objectContaining({ scopeType: 'call_participant' }),
    );
  });

  it('still stores a conversation participant record', async () => {
    const start = conversationStart();
    await replicate(start.payload, start.proof);
    const call = await repository.requireById(new CallId(start.callId));
    const at = now() + 1;
    const joined = signCallParticipant({
      at,
      callId: start.callId,
      signer: peer,
      state: 'joined',
    });
    call.join(new IdentityId(peer.id), new Timestamp(at));

    await repository.saveParticipant(
      call,
      new IdentityId(peer.id),
      new Timestamp(at),
      joined.proof,
    );

    expect(calls.put).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: start.callId,
        identityId: peer.id,
        scopeType: 'call_participant',
        state: 'joined',
      }),
    );
  });

  describe('a group-capability call', () => {
    const capabilityHash = 'b'.repeat(64);
    const groupStart = (startedAt = now()) =>
      signCallStart({
        networkId,
        nonce: nonce(),
        scope: { capabilityHash, type: 'group_capability' },
        signer: creator,
        startedAt,
      });
    const leaseFor = (callId: string, signer: CallSigner) =>
      CallParticipantLease.connect(
        new CallId(callId),
        new IdentityId(signer.id),
        new NodeId('550e8400-e29b-41d4-a716-446655440012'),
        new NetworkId(networkId),
        [],
      );

    it('stores a start naming only the capability hash and no participant', async () => {
      const { payload, proof } = groupStart();
      const call = Call.start(
        new IdentityId(creator.id),
        new NetworkId(networkId),
        CallScope.groupCapability(new CallCapabilityHash(capabilityHash)),
        [],
        new CallNonce(payload.nonce as string),
        new Timestamp(payload.startedAt as number),
      );

      await repository.saveStart(call, proof);

      expect(calls.put).toHaveBeenCalledWith(
        expect.objectContaining({
          participantIds: [],
          scope: { capabilityHash, type: 'group_capability' },
          scopeType: 'call_start',
        }),
      );
    });

    it('takes its roster from the participation leases', async () => {
      const start = groupStart();
      await replicate(start.payload, start.proof);
      await leases.save(leaseFor(start.callId, peer));

      const call = await repository.requireById(new CallId(start.callId));

      expect(call.getJoinedParticipantIds().map((id) => id.valueOf())).toEqual([
        peer.id,
      ]);
      const active = await repository.findActiveByParticipant(
        new IdentityId(peer.id),
      );
      expect(active.map((found) => found.getId().valueOf())).toEqual([
        start.callId,
      ]);
    });

    it('expires once nobody has held a lease past the grace period', async () => {
      const start = groupStart(now() - 120_000);
      await replicate(start.payload, start.proof);

      const call = await repository.requireById(new CallId(start.callId));

      expect(call.isActive()).toBe(false);
    });

    it('verifies but does not store a participant record', async () => {
      const start = groupStart();
      await replicate(start.payload, start.proof);
      const call = await repository.requireById(new CallId(start.callId));
      const at = now() + 1;
      const joined = signCallParticipant({
        at,
        callId: start.callId,
        signer: peer,
        state: 'joined',
      });
      call.joinOrAdd(new IdentityId(peer.id), new Timestamp(at));

      await repository.saveParticipant(
        call,
        new IdentityId(peer.id),
        new Timestamp(at),
        joined.proof,
      );

      expect(calls.put).not.toHaveBeenCalledWith(
        expect.objectContaining({ scopeType: 'call_participant' }),
      );
    });
  });

  describe('on a restarted node holding call records it cannot admit yet', () => {
    let authorizationLoaded: boolean;
    let participantAuthorizationLoaded: boolean;

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      authorizationLoaded = false;
      participantAuthorizationLoaded = true;
      const gate = mock<OrbitDBMutationGate>();

      gate.governs.mockImplementation((collection) => collection === 'calls');
      gate.governsHead.mockReturnValue(false);
      gate.verdictOf.mockImplementation((_collection, record) =>
        Promise.resolve(
          authorizationLoaded &&
            (participantAuthorizationLoaded ||
              record.scopeType !== 'call_participant')
            ? 'accepted'
            : 'pending',
        ),
      );
      registry.addMutationGate(gate);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('answers a call whose start waits to be admitted as not ready, not as missing', async () => {
      const start = conversationStart();

      await replicate(start.payload, start.proof);

      await expect(
        repository.requireById(new CallId(start.callId)),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
      await expect(
        repository.requireById(
          new CallId('550e8400-e29b-41d4-a716-446655440009'),
        ),
      ).rejects.toBeInstanceOf(CallNotFoundError);

      authorizationLoaded = true;
      await jest.advanceTimersByTimeAsync(2_000);

      const call = await repository.requireById(new CallId(start.callId));

      expect(call.isActive()).toBe(true);
    });

    it('answers a call whose start stays rejected after the last attempt as missing', async () => {
      const start = conversationStart();

      await replicate(start.payload, start.proof);
      await jest.advanceTimersByTimeAsync(2_000 + 10_000 + 60_000);

      await expect(
        repository.requireById(new CallId(start.callId)),
      ).rejects.toBeInstanceOf(CallNotFoundError);
    });

    it('answers a participant whose own record waits to be admitted as not ready', async () => {
      const start = conversationStart();
      const joined = signCallParticipant({
        at: now() + 1,
        callId: start.callId,
        signer: peer,
        state: 'joined',
      });
      const callId = new CallId(start.callId);
      authorizationLoaded = true;
      participantAuthorizationLoaded = false;

      await replicate(start.payload, start.proof);
      await replicate(joined.payload, joined.proof);

      const call = await repository.requireById(callId);

      expect(call.hasJoinedParticipant(new IdentityId(peer.id))).toBe(false);
      await expect(
        repository.assertParticipantSettled(callId, new IdentityId(peer.id)),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
      await expect(
        repository.assertParticipantSettled(callId, new IdentityId(creator.id)),
      ).resolves.toBeUndefined();

      participantAuthorizationLoaded = true;
      await jest.advanceTimersByTimeAsync(2_000);

      const admitted = await repository.requireById(callId);

      expect(admitted.hasJoinedParticipant(new IdentityId(peer.id))).toBe(true);
      await expect(
        repository.assertParticipantSettled(callId, new IdentityId(peer.id)),
      ).resolves.toBeUndefined();
    });

    it('answers a participant whose record stays rejected after the last attempt as settled', async () => {
      const start = conversationStart();
      const joined = signCallParticipant({
        at: now() + 1,
        callId: start.callId,
        signer: peer,
        state: 'joined',
      });
      const callId = new CallId(start.callId);
      authorizationLoaded = true;
      participantAuthorizationLoaded = false;

      await replicate(start.payload, start.proof);
      await replicate(joined.payload, joined.proof);
      await jest.advanceTimersByTimeAsync(2_000 + 10_000 + 60_000);

      await expect(
        repository.assertParticipantSettled(callId, new IdentityId(peer.id)),
      ).resolves.toBeUndefined();
    });
  });

  describe('while the call store history could not be replayed yet', () => {
    const unknownCallId = new CallId('550e8400-e29b-41d4-a716-446655440019');

    beforeEach(async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      await build(false);
      calls.all.mockRejectedValueOnce(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );
      await projection.start();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('answers a call it cannot find yet as not ready, not as missing', async () => {
      await expect(
        repository.requireById(unknownCallId),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
      await expect(
        repository.assertParticipantSettled(
          unknownCallId,
          new IdentityId(peer.id),
        ),
      ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
    });

    it('answers a missing call as missing once the replay succeeds', async () => {
      const start = conversationStart();

      await replicate(start.payload, start.proof);

      await expect(
        repository.requireById(unknownCallId),
      ).rejects.toBeInstanceOf(CallNotFoundError);
      await expect(
        repository.assertParticipantSettled(
          unknownCallId,
          new IdentityId(peer.id),
        ),
      ).resolves.toBeUndefined();
    });

    it('answers a missing call as missing once the bounded wait is over', async () => {
      await jest.advanceTimersByTimeAsync(
        OrbitDBReplicatedStateRegistry.DEFERRED_BOOTSTRAP_NOT_READY_MS,
      );

      await expect(
        repository.requireById(unknownCallId),
      ).rejects.toBeInstanceOf(CallNotFoundError);
      await expect(
        repository.assertParticipantSettled(
          unknownCallId,
          new IdentityId(peer.id),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
