import { CallParticipantLease } from '@app/contexts/calls/domain/CallParticipantLease';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import InMemoryCallParticipantLeaseRepository from '@app/contexts/calls/infrastructure/memory/InMemoryCallParticipantLeaseRepository';
import { webSocketEventHub } from '@app/shared/infrastructure/websocket/WebSocketEventHub';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { OrbitDBCallDocument } from '@app/contexts/calls/infrastructure/orbitdb/documents/OrbitDBCallDocument';
import OrbitDBCallMapper from '@app/contexts/calls/infrastructure/orbitdb/mappers/OrbitDBCallMapper';
import OrbitDBCallDocumentReplicator from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentReplicator';
import OrbitDBCallDocumentMerger from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallDocumentMerger';
import OrbitDBCallProjection from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallProjection';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

type UpdateHandler = (entry: { payload?: { value?: unknown } }) => void;

function createStore(initialDocuments: Record<string, unknown>[] = []) {
  const entries = new Map(
    initialDocuments.map((document) => [String(document.id), document]),
  );
  const updateHandlers: UpdateHandler[] = [];

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    emitUpdate(document: Record<string, unknown>): void {
      for (const handler of updateHandlers) {
        handler({ payload: { value: document } });
      }
    },
    events: {
      on: jest.fn((event: string, handler: UpdateHandler) => {
        if (event === 'update') {
          updateHandlers.push(handler);
        }
      }),
    },
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(
      async (
        keyOrDocument: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);
        const document =
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument;

        entries.set(key, document);

        return key;
      },
    ),
  };
}

describe('OrbitDBCallRepository', () => {
  const creatorIdentityId =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const participantIdentityId =
    'MCowBQYDK2VwAyEAwRhK+CGU7bzgh7bzBS8SIn3jGiI7i4AqA9KX6niQ2pc=';
  const callId = '550e8400-e29b-41d4-a716-446655440001';
  const networkId = '550e8400-e29b-41d4-a716-446655440002';
  const communityId = new CommunityId('community-1');
  const channelId = new CommunityChannelId('channel-1');
  let calls: ReturnType<typeof createStore>;
  let heads: ReturnType<typeof createStore>;
  let projection: OrbitDBCallProjection;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCallRepository;
  let leases: InMemoryCallParticipantLeaseRepository;

  const publicStorageGuard = () =>
    new PrivateCommunityPublicStorageGuard(
      { findScope: jest.fn().mockResolvedValue(undefined) } as never,
      new PrivateAuthorizationStorageCoordinator(),
    );

  function communityCall(status: 'active' | 'ended' = 'active'): Call {
    return Call.fromPrimitives({
      createdAt: 1_780_000_000_000,
      creatorIdentityId,
      endedAt: status === 'ended' ? 1_780_000_005_000 : undefined,
      endedByIdentityId: status === 'ended' ? creatorIdentityId : undefined,
      id: callId,
      networkId,
      participantIds: [creatorIdentityId, participantIdentityId],
      participants: [
        {
          identityId: creatorIdentityId,
          joinedAt: 1_780_000_000_000,
          status: 'joined',
        },
        {
          identityId: participantIdentityId,
          status: 'ringing',
        },
      ],
      scope: {
        channelId: channelId.valueOf(),
        communityId: communityId.valueOf(),
        conversationId: undefined,
        type: 'community_channel',
      },
      status,
    });
  }

  function document(
    status: 'active' | 'ended' = 'active',
    updatedAt = 1_780_000_000_000,
  ): OrbitDBCallDocument {
    return {
      ...new OrbitDBCallMapper().toDocument(communityCall(status)),
      updatedAt,
    };
  }

  async function createRepository(
    initialDocuments: OrbitDBCallDocument[] = [],
  ): Promise<void> {
    calls = createStore(initialDocuments);
    heads = createStore();
    registry = new OrbitDBReplicatedStateRegistry();
    await registry.register(networkId, { calls, heads } as never);
    projection = new OrbitDBCallProjection(
      registry,
      new OrbitDBCallDocumentMerger(),
      new OrbitDBCallDocumentReplicator(registry),
      publicStorageGuard(),
    );
    leases = new InMemoryCallParticipantLeaseRepository();
    repository = new OrbitDBCallRepository(
      new OrbitDBCallMapper(),
      new OrbitDBCallDocumentReplicator(registry),
      projection,
      leases,
      publicStorageGuard(),
    );
    await projection.start();
  }

  beforeEach(async () => {
    await createRepository();
  });

  afterEach(() => {
    registry.clear();
  });

  it.each([true, false])('does not expose historical active calls while a running projection replays (success=%s)', async (success) => {
    const subscribe = jest.spyOn(registry, 'onDocumentUpdated');
    const laterProjection = new OrbitDBCallProjection(registry, new OrbitDBCallDocumentMerger(), new OrbitDBCallDocumentReplicator(registry), publicStorageGuard());

    await laterProjection.start();
    const observer = subscribe.mock.calls[0][2]!.historyObserver!;
    const scope = {};
    observer.started(scope);
    await subscribe.mock.calls[0][1](document(), scope);
    await flushBackgroundTasks();

    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toEqual([]);
    await expect(laterProjection.findTimedOutRingingCalls(new Timestamp(1_780_000_010_000))).resolves.toEqual([]);
    await subscribe.mock.calls[0][1](document('ended', 1_780_000_005_000), scope);
    await flushBackgroundTasks();
    observer.finished(scope, success);
    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toEqual([]);
    if (!success) await expect(laterProjection.findById(new CallId(callId))).resolves.toBeUndefined();
  });

  it('keeps a successful replay when an overlapping replay fails', async () => {
    const subscribe = jest.spyOn(registry, 'onDocumentUpdated');
    const laterProjection = new OrbitDBCallProjection(registry, new OrbitDBCallDocumentMerger(), new OrbitDBCallDocumentReplicator(registry), publicStorageGuard());

    await laterProjection.start();
    const observer = subscribe.mock.calls[0][2]!.historyObserver!;
    const listener = subscribe.mock.calls[0][1];
    const first = {};
    const second = {};
    const secondDocument = { ...document(), id: '550e8400-e29b-41d4-a716-446655440099' };
    observer.started(first);
    observer.started(second);
    await listener(document(), first);
    await listener(secondDocument, second);
    observer.finished(first, true);
    observer.finished(second, false);

    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toHaveLength(1);
    observer.started(second);
    await listener(secondDocument, second);
    observer.finished(second, true);
    await expect(laterProjection.findActiveByCommunity(communityId)).resolves.toHaveLength(2);
  });

  it('writes one canonical OrbitDB document without replicated call heads', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();

    expect(calls.put).toHaveBeenCalledTimes(1);
    expect(heads.put).not.toHaveBeenCalled();
    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
  });

  it('rejects protected community call reads and writes through OrbitDB', async () => {
    const protectedRepository = new OrbitDBCallRepository(
      new OrbitDBCallMapper(),
      new OrbitDBCallDocumentReplicator(registry),
      projection,
      leases,
      new PrivateCommunityPublicStorageGuard(
        { findScope: jest.fn().mockResolvedValue({}) } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );

    await expect(protectedRepository.save(communityCall())).rejects.toThrow(
      'Invalid private authorization',
    );
    await expect(
      protectedRepository.findByCommunityChannel(communityId, channelId),
    ).rejects.toThrow('Invalid private authorization');
    expect(calls.put).not.toHaveBeenCalled();
  });

  it('filters protected calls before hydrating aggregate results', async () => {
    await repository.save(communityCall());
    const leaseLookup = jest.spyOn(leases, 'findByCallIds');
    const protectedRepository = new OrbitDBCallRepository(
      new OrbitDBCallMapper(),
      new OrbitDBCallDocumentReplicator(registry),
      projection,
      leases,
      new PrivateCommunityPublicStorageGuard(
        {
          findScope: jest.fn().mockImplementation((scopeId: string) =>
            Promise.resolve(
              scopeId === communityId.valueOf() ? ({} as never) : undefined,
            ),
          ),
        } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );

    await expect(
      protectedRepository.findActiveByParticipant(
        new IdentityId(participantIdentityId),
      ),
    ).resolves.toEqual([]);
    await expect(
      protectedRepository.findTimedOutRingingCalls(
        new Timestamp(1_780_000_010_000),
      ),
    ).resolves.toEqual([]);
    expect(leaseLookup).not.toHaveBeenCalled();
  });

  it('keeps scope protection behind an admitted call publication', async () => {
    const coordinator = new PrivateAuthorizationStorageCoordinator();
    let protectedScope = false;
    let releaseWrite!: () => void;
    const write = new Promise<string>((resolve) => {
      releaseWrite = () => resolve(callId);
    });
    calls.put.mockReturnValueOnce(write);
    const fencedRepository = new OrbitDBCallRepository(
      new OrbitDBCallMapper(),
      new OrbitDBCallDocumentReplicator(registry),
      projection,
      leases,
      new PrivateCommunityPublicStorageGuard(
        {
          findScope: jest.fn(async () => (protectedScope ? {} : undefined)),
        } as never,
        coordinator,
      ),
    );

    const publication = fencedRepository.save(communityCall());
    await flushBackgroundTasks();
    const protection = coordinator.exclusively(
      communityId.valueOf(),
      async () => {
        protectedScope = true;
      },
    );
    await flushBackgroundTasks();

    expect(protectedScope).toBe(false);
    releaseWrite();
    await Promise.all([publication, protection]);
    expect(protectedScope).toBe(true);
  });

  it('rejects reads until canonical documents have been projected', async () => {
    const unstartedProjection = new OrbitDBCallProjection(
      registry,
      new OrbitDBCallDocumentMerger(),
      new OrbitDBCallDocumentReplicator(registry),
      publicStorageGuard(),
    );
    const unstartedRepository = new OrbitDBCallRepository(
      new OrbitDBCallMapper(),
      new OrbitDBCallDocumentReplicator(registry),
      unstartedProjection,
      new InMemoryCallParticipantLeaseRepository(),
      publicStorageGuard(),
    );

    await expect(
      unstartedRepository.findById(new CallId(callId)),
    ).rejects.toMatchObject({ code: 503020, httpCode: 503 });
  });

  it('starts the local projection only once', async () => {
    await projection.start();

    expect(calls.events.on).toHaveBeenCalledTimes(2);
    expect(calls.events.on).toHaveBeenCalledWith(
      'update',
      expect.any(Function),
    );
    expect(calls.events.on).toHaveBeenCalledWith('join', expect.any(Function));
  });

  it('keeps all call queries current from the local projection', async () => {
    await repository.save(communityCall());

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toHaveLength(1);
    await expect(
      repository.findActiveByCommunityChannel(communityId, channelId),
    ).resolves.toBeDefined();
    await expect(
      repository.findByParticipant(new IdentityId(participantIdentityId)),
    ).resolves.toHaveLength(0);
    await expect(
      repository.findTimedOutRingingCalls(new Timestamp(1_780_000_000_000)),
    ).resolves.toHaveLength(0);

    await repository.save(communityCall('ended'));

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
  });

  it('bootstraps the local projection from canonical OrbitDB documents', async () => {
    registry.clear();
    await createRepository([document()]);

    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
    await expect(
      repository.findActiveByCommunityChannel(communityId, channelId),
    ).resolves.toBeDefined();
  });

  it('projects newer documents replicated by OrbitDB', async () => {
    calls.emitUpdate(document('active'));
    calls.emitUpdate(document('ended', 1_780_000_005_000));
    await flushBackgroundTasks();

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
    await expect(repository.findById(new CallId(callId))).resolves.toEqual(
      expect.objectContaining({ getId: expect.any(Function) }),
    );
  });

  it('notifies live clients when a replicated participant arrives after its lease', async () => {
    const notify = jest.spyOn(webSocketEventHub, 'publishCallSnapshot');
    const initial = document();
    calls.emitUpdate(initial);
    await flushBackgroundTasks();
    notify.mockClear();

    const joined = {
      ...document('active', 1_780_000_005_000),
      participants: initial.participants.map((participant) => ({
        ...participant,
        joinedAt: 1_780_000_005_000,
        status: 'joined',
      })),
    };
    calls.emitUpdate(joined);
    await flushBackgroundTasks();

    expect(notify).toHaveBeenCalledWith(callId);
    expect(notify).toHaveBeenCalledTimes(1);
    calls.emitUpdate(joined);
    calls.emitUpdate(initial);
    await flushBackgroundTasks();
    expect(notify).toHaveBeenCalledTimes(1);
    notify.mockRestore();
  });

  it('ignores stale replicated documents', async () => {
    calls.emitUpdate(document('ended', 1_780_000_005_000));
    calls.emitUpdate(document('active', 1_780_000_000_000));
    await flushBackgroundTasks();

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
  });

  it('does not repair call documents after their community is protected', async () => {
    const protectedCalls = createStore();
    const protectedRegistry = new OrbitDBReplicatedStateRegistry();
    await protectedRegistry.register(networkId, {
      calls: protectedCalls,
      heads: createStore(),
    } as never);
    const protectedProjection = new OrbitDBCallProjection(
      protectedRegistry,
      new OrbitDBCallDocumentMerger(),
      new OrbitDBCallDocumentReplicator(protectedRegistry),
      new PrivateCommunityPublicStorageGuard(
        { findScope: jest.fn().mockResolvedValue({}) } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );
    await protectedProjection.start();
    protectedCalls.emitUpdate(document('ended', 1_780_000_005_000));
    await flushBackgroundTasks();
    protectedCalls.put.mockClear();

    protectedCalls.emitUpdate(document('active', 1_780_000_000_000));
    await flushBackgroundTasks();
    await flushBackgroundTasks();

    expect(protectedCalls.put).not.toHaveBeenCalled();
    protectedRegistry.clear();
  });

  it.each(['forward', 'reverse'] as const)(
    'does not restore community participation from competing legacy snapshots in %s order',
    async (order) => {
      const creatorRejoined = {
        identityId: creatorIdentityId,
        joinedAt: 1_780_000_000_200,
        status: 'joined',
      };
      const participantRejoined = {
        identityId: participantIdentityId,
        joinedAt: 1_780_000_000_210,
        status: 'joined',
      };
      const creatorSnapshot: OrbitDBCallDocument = {
        ...document('active', 1_780_000_000_200),
        participants: [
          creatorRejoined,
          {
            identityId: participantIdentityId,
            joinedAt: 1_780_000_000_000,
            leftAt: 1_780_000_000_100,
            status: 'left',
          },
        ],
      };
      const participantSnapshot: OrbitDBCallDocument = {
        ...document('active', 1_780_000_000_210),
        participants: [
          {
            identityId: creatorIdentityId,
            joinedAt: 1_780_000_000_000,
            leftAt: 1_780_000_000_100,
            status: 'left',
          },
          participantRejoined,
        ],
      };
      const snapshots = [creatorSnapshot, participantSnapshot];

      const orderedSnapshots =
        order === 'forward' ? snapshots : snapshots.reverse();

      for (const snapshot of orderedSnapshots) {
        calls.emitUpdate(snapshot);
      }
      await flushBackgroundTasks();

      const call = await repository.findById(new CallId(callId));

      expect(call).toBeDefined();
      for (const identityId of [creatorIdentityId, participantIdentityId]) {
        expect(() =>
          call!.assertParticipantCanHeartbeat(new IdentityId(identityId)),
        ).toThrow();
      }
      expect(call!.toPrimitives().participants).toEqual([]);
    },
  );

  it('derives community membership only from expiring runtime grants', async () => {
    await repository.save(communityCall());
    const participant = new IdentityId(participantIdentityId);
    const lease = CallParticipantLease.connect(new CallId(callId), participant,
      new NodeId('550e8400-e29b-41d4-a716-446655440003'), new NetworkId(networkId), [participant]);
    await leases.save(lease);
    await expect(repository.findActiveByParticipant(participant)).resolves.toHaveLength(1);
    expect((await repository.findById(new CallId(callId)))!.hasJoinedParticipant(participant)).toBe(true);
    lease.disconnect();
    await leases.save(lease);
    expect((await repository.findById(new CallId(callId)))!.hasJoinedParticipant(participant)).toBe(true);
    lease.leave();
    await leases.save(lease);
    expect((await repository.findById(new CallId(callId)))!.hasJoinedParticipant(participant)).toBe(false);
    await expect(repository.findActiveByParticipant(participant)).resolves.toEqual([]);
    const raw = new OrbitDBCallMapper().toDocument(communityCall());
    expect(JSON.stringify(raw)).not.toContain(participantIdentityId);
  });

  it('registers gossip replicas for immediate reads without persistence', async () => {
    await repository.registerReplica(communityCall());

    expect(calls.put).not.toHaveBeenCalled();
    expect(heads.put).not.toHaveBeenCalled();
    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
  });

  it('does not persist stale gossip projections as durable repairs', async () => {
    calls.emitUpdate(document('ended', 1_780_000_005_000));
    await flushBackgroundTasks();
    calls.put.mockClear();

    await repository.registerReplica(communityCall());
    await repository.registerReplica(communityCall());
    await flushBackgroundTasks();

    expect(calls.put).not.toHaveBeenCalled();
    await expect(repository.findActiveByCommunity(communityId)).resolves.toEqual([]);
  });

  it('keeps the save pending until canonical document replication finishes', async () => {
    const delayedWrite = deferred<string>();
    calls.put.mockImplementationOnce(() => delayedWrite.promise);

    const save = repository.save(communityCall());
    const result = await Promise.race([
      save.then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('blocked');
    const lookup = repository.findById(new CallId(callId));
    await expect(
      Promise.race([
        lookup.then(() => 'completed'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
      ]),
    ).resolves.toBe('blocked');
    delayedWrite.resolve(callId);
    await save;
    await expect(lookup).resolves.toBeDefined();
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
