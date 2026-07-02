import { Call } from '@app/contexts/calls/domain/Call';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { OrbitDBCallDocument } from '@app/contexts/calls/infrastructure/orbitdb/documents/OrbitDBCallDocument';
import { Timestamp } from '@haskou/value-objects';

type Entry = {
  key?: string;
  value: Record<string, unknown>;
};

function createStore(): {
  all: jest.Mock<Promise<Entry[]>>;
  get: jest.Mock<Promise<Record<string, unknown> | undefined>, [string]>;
  put: jest.Mock<Promise<string>, [string | Record<string, unknown>, unknown?]>;
  query: jest.Mock<
    Promise<Record<string, unknown>[]>,
    [(document: Record<string, unknown>) => boolean]
  >;
  events: {
    on: jest.Mock<void, ['update', () => void]>;
  };
} {
  const entries = new Map<string, Record<string, unknown>>();

  return {
    all: jest.fn(async () =>
      [...entries.entries()].map(([key, value]) => ({ key, value })),
    ),
    events: {
      on: jest.fn(),
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
    query: jest.fn(async (matcher) =>
      [...entries.values()].filter((document) => matcher(document)),
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
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBCallRepository;

  function communityCall(status: 'active' | 'ended' = 'active'): Call {
    return Call.fromPrimitives({
      createdAt: 1780000000000,
      creatorIdentityId,
      endedAt: status === 'ended' ? 1780000005000 : undefined,
      endedByIdentityId: status === 'ended' ? creatorIdentityId : undefined,
      id: callId,
      networkId,
      participantIds: [creatorIdentityId, participantIdentityId],
      participants: [
        {
          identityId: creatorIdentityId,
          joinedAt: 1780000000000,
          lastSeenAt: 1780000000000,
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

  function communityCallDocument(
    status: 'active' | 'ended' = 'active',
  ): OrbitDBCallDocument {
    const primitives = communityCall(status).toPrimitives();

    return {
      createdAt: primitives.createdAt,
      creatorIdentityId: primitives.creatorIdentityId,
      endedAt: primitives.endedAt,
      endedByIdentityId: primitives.endedByIdentityId,
      id: primitives.id,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      participants: primitives.participants,
      scope: primitives.scope,
      status: primitives.status,
      updatedAt: 1780000000000,
    };
  }

  beforeEach(() => {
    calls = createStore();
    heads = createStore();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register(networkId, {
      calls,
      heads,
    } as never);
    repository = new OrbitDBCallRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('reads active community calls from indexes after saving', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();
    calls.query.mockClear();

    const result = await repository.findActiveByCommunity(communityId);

    expect(result.map((call) => call.toPrimitives().id)).toEqual([callId]);
    expect(calls.query).not.toHaveBeenCalled();
  });

  it('removes ended calls from active indexes after saving the newer state', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();
    await repository.save(communityCall('ended'));
    await flushBackgroundTasks();
    calls.query.mockClear();

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
    expect(calls.query).not.toHaveBeenCalled();
  });

  it('uses the active index for timeout checks', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();
    calls.query.mockClear();

    const timedOut = await repository.findTimedOutRingingCalls(
      new Timestamp(1780000000000),
    );

    expect(timedOut.map((call) => call.toPrimitives().id)).toEqual([callId]);
    expect(calls.query).not.toHaveBeenCalled();
  });

  it('prefers fresh call heads over stale timeout indexes', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();
    const staleActiveIndex = await heads.get('call-active-index');
    const missedDocument: OrbitDBCallDocument = {
      ...communityCallDocument(),
      participants: [
        {
          identityId: creatorIdentityId,
          joinedAt: 1780000000000,
          lastSeenAt: 1780000000000,
          status: 'joined',
        },
        {
          identityId: participantIdentityId,
          missedAt: 1780000060000,
          status: 'missed',
        },
      ],
      status: 'missed',
      updatedAt: 1780000060000,
    };

    expect(staleActiveIndex).toBeDefined();

    const replicatedHeads = createStore();
    const replicatedRegistry = new OrbitDBReplicatedStateRegistry();

    await replicatedHeads.put(`call:${callId}`, missedDocument);
    await replicatedHeads.put('call-active-index', staleActiveIndex);
    await replicatedRegistry.register(networkId, {
      calls: createStore(),
      heads: replicatedHeads,
    } as never);

    const replicatedRepository = new OrbitDBCallRepository(replicatedRegistry);

    try {
      await expect(
        replicatedRepository.findTimedOutRingingCalls(
          new Timestamp(1780000060000),
        ),
      ).resolves.toEqual([]);
    } finally {
      replicatedRegistry.clear();
    }
  });

  it('does not wait for secondary indexes when saving calls', async () => {
    const putHead = heads.put.getMockImplementation();

    heads.put.mockImplementation(
      async (keyOrDocument: string | Record<string, unknown>, value) => {
        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);

        if (key !== `call:${callId}`) {
          return new Promise(() => undefined);
        }

        return putHead?.(keyOrDocument, value) ?? key;
      },
    );

    const result = await Promise.race([
      repository.save(communityCall()).then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('saved');
    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
  });

  it('does not wait for call document replication when saving calls', async () => {
    calls.put.mockImplementationOnce(() => new Promise(() => undefined));

    const result = await Promise.race([
      repository.save(communityCall()).then(() => 'saved'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 10)),
    ]);

    expect(result).toBe('saved');
    await expect(
      repository.findById(new CallId(callId)),
    ).resolves.toBeDefined();
  });

  it('preserves call document replication order when previous writes are slow', async () => {
    const putCall = calls.put.getMockImplementation();
    const replicatedStatuses: string[] = [];
    let releaseFirstWrite: () => void = () => undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    calls.put.mockImplementation(
      async (keyOrDocument: string | Record<string, unknown>, value) => {
        const document =
          typeof keyOrDocument === 'string'
            ? (value as Record<string, unknown>)
            : keyOrDocument;

        replicatedStatuses.push(String(document.status));

        if (replicatedStatuses.length === 1) {
          await firstWrite;
        }

        return putCall?.(keyOrDocument, value) ?? String(document.id);
      },
    );

    await repository.save(communityCall());
    await repository.save(communityCall('ended'));
    await flushBackgroundTasks();

    expect(replicatedStatuses).toEqual(['active']);

    releaseFirstWrite();
    await flushBackgroundTasks();
    await flushBackgroundTasks();

    expect(replicatedStatuses).toEqual(['active', 'ended']);
    await expect(calls.get(callId)).resolves.toEqual(
      expect.objectContaining({ status: 'ended' }),
    );
  });

  it('prefers fresh call heads over stale active indexes', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();
    const staleActiveIndex = await heads.get(
      `call-community-active-index:${communityId.valueOf()}`,
    );

    await repository.save(communityCall('ended'));

    if (staleActiveIndex) {
      await registry.putHead(
        `call-community-active-index:${communityId.valueOf()}`,
        staleActiveIndex,
      );
    }

    await expect(
      repository.findActiveByCommunity(communityId),
    ).resolves.toEqual([]);
  });

  it('finds active community channel calls when channel indexes lag', async () => {
    const putHead = heads.put.getMockImplementation();

    heads.put.mockImplementation(
      async (keyOrDocument: string | Record<string, unknown>, value) => {
        const key =
          typeof keyOrDocument === 'string'
            ? keyOrDocument
            : String(keyOrDocument.id);

        if (key !== `call:${callId}`) {
          return new Promise(() => undefined);
        }

        return putHead?.(keyOrDocument, value) ?? key;
      },
    );

    await repository.save(communityCall());

    const activeCall = await repository.findActiveByCommunityChannel(
      communityId,
      channelId,
    );

    expect(activeCall?.toPrimitives().id).toBe(callId);
  });

  it('does not scan every cached call head when finding active community channel calls', async () => {
    await repository.save(communityCall());
    await flushBackgroundTasks();
    const findCachedHeadsByPrefix = jest.spyOn(
      registry,
      'findCachedHeadsByPrefix',
    );

    const activeCall = await repository.findActiveByCommunityChannel(
      communityId,
      channelId,
    );

    expect(activeCall?.toPrimitives().id).toBe(callId);
    expect(findCachedHeadsByPrefix).not.toHaveBeenCalled();
  });

  it('finds active community channel calls from the community active index when channel indexes lag on another repository instance', async () => {
    const document = communityCallDocument();
    const activeCommunityIndexKey = `call-community-active-index:${communityId.valueOf()}`;
    const replicatedHeads = createStore();
    const replicatedRegistry = new OrbitDBReplicatedStateRegistry();

    await replicatedHeads.put(`call:${callId}`, document);
    await replicatedHeads.put(activeCommunityIndexKey, {
      calls: [document],
      id: activeCommunityIndexKey,
      updatedAt: 1780000000000,
    });
    await replicatedRegistry.register(networkId, {
      calls: createStore(),
      heads: replicatedHeads,
    } as never);

    const replicatedRepository = new OrbitDBCallRepository(replicatedRegistry);
    const findCachedHeadsByPrefix = jest.spyOn(
      replicatedRegistry,
      'findCachedHeadsByPrefix',
    );

    const activeCall = await replicatedRepository.findActiveByCommunityChannel(
      communityId,
      channelId,
    );

    expect(activeCall?.toPrimitives().id).toBe(callId);
    expect(findCachedHeadsByPrefix).not.toHaveBeenCalled();
  });

  it('finds active community channel calls from a replicated call head when channel indexes are missing', async () => {
    const document = communityCallDocument();
    const replicatedHeads = createStore();
    const replicatedRegistry = new OrbitDBReplicatedStateRegistry();

    await replicatedHeads.put(`call:${callId}`, document);
    await replicatedRegistry.register(networkId, {
      calls: createStore(),
      heads: replicatedHeads,
    } as never);

    const replicatedRepository = new OrbitDBCallRepository(replicatedRegistry);
    const findCachedHeadsByPrefix = jest.spyOn(
      replicatedRegistry,
      'findCachedHeadsByPrefix',
    );

    const activeCall = await replicatedRepository.findActiveByCommunityChannel(
      communityId,
      channelId,
    );

    expect(activeCall?.toPrimitives().id).toBe(callId);
    expect(findCachedHeadsByPrefix).not.toHaveBeenCalled();
  });
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
