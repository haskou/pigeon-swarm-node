import { Call } from '@app/contexts/calls/domain/Call';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import OrbitDBCallRepository from '@app/contexts/calls/infrastructure/orbitdb/OrbitDBCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
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

    await expect(repository.findActiveByCommunity(communityId)).resolves.toEqual(
      [],
    );
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
    await expect(repository.findById(new CallId(callId))).resolves.toBeDefined();
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

    await expect(repository.findActiveByCommunity(communityId)).resolves.toEqual(
      [],
    );
  });
});

function flushBackgroundTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
