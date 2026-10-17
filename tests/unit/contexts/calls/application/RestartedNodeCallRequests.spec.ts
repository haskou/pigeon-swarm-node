import CallAccessAuthorizer from '@app/contexts/calls/application/authorize-call/CallAccessAuthorizer';
import CallJoiner from '@app/contexts/calls/application/join-call/CallJoiner';
import { CallJoinMessage } from '@app/contexts/calls/application/join-call/messages/CallJoinMessage';
import CallParticipantHeartbeatRecorder from '@app/contexts/calls/application/record-participant-heartbeat/CallParticipantHeartbeatRecorder';
import { CallParticipantHeartbeatRecordMessage } from '@app/contexts/calls/application/record-participant-heartbeat/messages/CallParticipantHeartbeatRecordMessage';
import CallParticipantLeaseRenewer from '@app/contexts/calls/application/renew-participant-lease/CallParticipantLeaseRenewer';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock } from 'jest-mock-extended';

import { ReopenedOrbitDBStore } from '../../../../support/ReopenedOrbitDBStore';
import {
  CallRecordPayload,
  CallSigner,
  newCallSigner,
  signCallParticipant,
  signCallStart,
} from '../../../../support/signCall';

interface LiveCall {
  callId: string;
  joined: { payload: CallRecordPayload; proof: PublicMutationProof };
  joinedRecord: Record<string, unknown>;
  startRecord: Record<string, unknown>;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const notReady = {
  code: ReplicatedStateNotReadyError.CODE,
  httpCode: 503,
};

/**
 * A node restarts during a live direct call and replays the call records it
 * stored before. Until those records are projected, a join or a heartbeat
 * answers the retryable 503 `503020`, never a final error that ends the call,
 * and both succeed once the records are projected.
 */
describe('join and heartbeat against a restarted node', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440031';
  let caller: CallSigner;
  let callee: CallSigner;
  let authorizationLoaded: boolean;
  let calleeAuthorizationLoaded: boolean;
  let registry: OrbitDBReplicatedStateRegistry;
  let leases: InMemoryCallParticipantLeaseRepository;
  let joiner: CallJoiner;
  let heartbeats: CallParticipantHeartbeatRecorder;
  let nonceSeed = 0;

  beforeAll(async () => {
    caller = await newCallSigner();
    callee = await newCallSigner();
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    authorizationLoaded = true;
    calleeAuthorizationLoaded = true;
  });

  afterEach(() => {
    registry.clear();
    jest.useRealTimers();
  });

  /** Each call has its own conversation, so no call supersedes another. */
  function liveCall(): LiveCall {
    const seed = String(++nonceSeed).padStart(8, '0');
    const start = signCallStart({
      networkId,
      nonce: `restarted-node-nonce-${seed}`,
      participantIds: [caller.id, callee.id].sort(),
      scope: {
        conversationId: `one-to-one:restarted-node-spec-${seed}`,
        type: 'conversation',
      },
      signer: caller,
      startedAt: Date.now(),
    });
    const joined = signCallParticipant({
      at: Date.now() + 1,
      callId: start.callId,
      signer: callee,
      state: 'joined',
    });

    return {
      callId: start.callId,
      joined,
      joinedRecord: PublicMutationRecord.withProof(
        joined.payload,
        joined.proof,
      ),
      startRecord: PublicMutationRecord.withProof(start.payload, start.proof),
    };
  }

  /**
   * Boots the node again over the stored records. Its admission gate accepts
   * a record only once the device authorization it rests on has loaded from
   * the peers, as after a real restart.
   */
  async function restart(calls: ReopenedOrbitDBStore): Promise<void> {
    registry = new OrbitDBReplicatedStateRegistry();
    const gate = mock<OrbitDBMutationGate>();

    gate.governs.mockImplementation((collection) => collection === 'calls');
    gate.governsHead.mockReturnValue(false);
    gate.accepts.mockImplementation((_collection, record) =>
      Promise.resolve(
        authorizationLoaded &&
          (calleeAuthorizationLoaded ||
            record.scopeType !== 'call_participant'),
      ),
    );
    registry.addMutationGate(gate);
    await registry.register(networkId, {
      calls,
      heads: new ReopenedOrbitDBStore(),
    } as never);

    const projection = new OrbitDBCallProjection(registry);
    const repository = new OrbitDBCallRepository(
      registry,
      projection,
      (leases = new InMemoryCallParticipantLeaseRepository()),
      new PrivateCommunityPublicStorageGuard(
        { hasScope: jest.fn().mockResolvedValue(false) } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );
    const nodes = mock<NodeRepository>();

    nodes.loadLocalNodeId.mockResolvedValue(
      new NodeId('550e8400-e29b-41d4-a716-446655440032'),
    );
    const renewer = new CallParticipantLeaseRenewer(leases, nodes);

    joiner = new CallJoiner(
      repository,
      mock<DomainEventPublisher>(),
      renewer,
      mock<CallAccessAuthorizer>(),
    );
    heartbeats = new CallParticipantHeartbeatRecorder(
      repository,
      renewer,
      mock<DomainEventPublisher>(),
      mock<CallAccessAuthorizer>(),
    );
    await projection.start();
    await flush();
  }

  function join(call: LiveCall) {
    return joiner.join(
      new CallJoinMessage(
        call.callId,
        callee.id,
        call.joined.proof.toPrimitives(),
        call.joined.payload.at as number,
      ),
    );
  }

  function heartbeat(call: LiveCall) {
    return heartbeats.record(
      new CallParticipantHeartbeatRecordMessage(call.callId, callee.id, []),
    );
  }

  async function connectedLeases(call: LiveCall) {
    return (await leases.findByCallIds([new CallId(call.callId)])).filter(
      (lease) => lease.isConnected(),
    );
  }

  describe('while the authorization the call records rest on still loads', () => {
    it('answers a join not ready, then joins once the start is admitted', async () => {
      const call = liveCall();
      authorizationLoaded = false;

      await restart(new ReopenedOrbitDBStore([call.startRecord]));

      await expect(join(call)).rejects.toMatchObject(notReady);

      authorizationLoaded = true;
      await jest.advanceTimersByTimeAsync(2_000);

      const joined = await join(call);

      expect(joined.hasJoinedParticipant(new IdentityId(callee.id))).toBe(true);
      expect(await connectedLeases(call)).toHaveLength(1);
    });

    it('answers a heartbeat not ready while nothing is admitted, then records it', async () => {
      const call = liveCall();
      authorizationLoaded = false;

      await restart(
        new ReopenedOrbitDBStore([call.startRecord, call.joinedRecord]),
      );

      await expect(heartbeat(call)).rejects.toMatchObject(notReady);

      authorizationLoaded = true;
      await jest.advanceTimersByTimeAsync(2_000);

      await expect(heartbeat(call)).resolves.toBeDefined();
      expect(await connectedLeases(call)).toHaveLength(1);
    });

    it('answers a heartbeat not ready while only the own join waits, then records it', async () => {
      const call = liveCall();
      calleeAuthorizationLoaded = false;

      await restart(
        new ReopenedOrbitDBStore([call.startRecord, call.joinedRecord]),
      );

      await expect(heartbeat(call)).rejects.toMatchObject(notReady);

      calleeAuthorizationLoaded = true;
      await jest.advanceTimersByTimeAsync(2_000);

      await expect(heartbeat(call)).resolves.toBeDefined();
      expect(await connectedLeases(call)).toHaveLength(1);
    });
  });

  describe('while the call history could not be replayed for a missing block', () => {
    /** The oplog block before the head is not local yet: loading it times out once. */
    function missingBlockStore(
      documents: Record<string, unknown>[],
    ): ReopenedOrbitDBStore {
      const calls = new ReopenedOrbitDBStore(documents);

      calls.log.get.mockRejectedValueOnce(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      );

      return calls;
    }

    it('answers a join not ready, then joins once the replay succeeds', async () => {
      const earlier = liveCall();
      const call = liveCall();
      const calls = missingBlockStore([earlier.startRecord, call.startRecord]);

      await restart(calls);

      await expect(join(call)).rejects.toMatchObject(notReady);

      calls.hearFromPeer();
      await flush();

      const joined = await join(call);

      expect(joined.hasJoinedParticipant(new IdentityId(callee.id))).toBe(true);
      expect(await connectedLeases(call)).toHaveLength(1);
    });

    it('answers a heartbeat not ready, then records it once the replay succeeds', async () => {
      const call = liveCall();
      const calls = missingBlockStore([call.startRecord, call.joinedRecord]);

      await restart(calls);

      await expect(heartbeat(call)).rejects.toMatchObject(notReady);

      calls.hearFromPeer();
      await flush();

      await expect(heartbeat(call)).resolves.toBeDefined();
      expect(await connectedLeases(call)).toHaveLength(1);
    });
  });
});
