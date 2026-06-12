import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import OrbitDBPollRepository from '@app/contexts/polls/infrastructure/orbitdb/OrbitDBPollRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

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

describe('OrbitDBPollRepository', () => {
  const creatorIdentityId =
    'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
  const networkId = '550e8400-e29b-41d4-a716-446655440002';
  const communityId = new CommunityId('community-1');
  const channelId = new CommunityChannelId('channel-1');
  const conversationId = new ConversationId('group:conversation-1');
  let polls: ReturnType<typeof createStore>;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBPollRepository;

  function poll(scope: 'community_channel' | 'group_conversation'): Poll {
    return Poll.create(
      new IdentityId(creatorIdentityId),
      scope === 'community_channel'
        ? PollScope.communityChannel(
            communityId,
            channelId,
            new NetworkId(networkId),
          )
        : PollScope.groupConversation(
            conversationId,
            new NetworkId(networkId),
          ),
      new PollQuestion('Question?'),
      [
        PollOption.create(
          new PollOptionId('yes-1'),
          new PollOptionText('Yes'),
        ),
        PollOption.create(new PollOptionId('no-1'), new PollOptionText('No')),
      ],
      false,
    );
  }

  beforeEach(() => {
    polls = createStore();
    registry = new OrbitDBReplicatedStateRegistry();
    registry.register(networkId, {
      heads: createStore(),
      polls,
    } as never);
    repository = new OrbitDBPollRepository(registry);
  });

  afterEach(() => {
    registry.clear();
  });

  it('reads community channel polls from the scope index after saving', async () => {
    const savedPoll = poll('community_channel');

    await repository.save(savedPoll);
    polls.query.mockClear();

    const result = await repository.findByCommunityChannel(
      communityId,
      channelId,
      10,
    );

    expect(result.map((item) => item.toPrimitives().id)).toEqual([
      savedPoll.getId().valueOf(),
    ]);
    expect(polls.query).not.toHaveBeenCalled();
  });

  it('reads group conversation polls from the scope index after saving', async () => {
    const savedPoll = poll('group_conversation');

    await repository.save(savedPoll);
    polls.query.mockClear();

    const result = await repository.findByGroupConversation(
      conversationId,
      10,
    );

    expect(result.map((item) => item.toPrimitives().id)).toEqual([
      savedPoll.getId().valueOf(),
    ]);
    expect(polls.query).not.toHaveBeenCalled();
  });

  it('reads polls by id from the direct head after saving', async () => {
    const savedPoll = poll('community_channel');

    await repository.save(savedPoll);
    polls.query.mockClear();

    const result = await repository.findById(savedPoll.getId());

    expect(result?.toPrimitives().id).toBe(savedPoll.getId().valueOf());
    expect(polls.query).not.toHaveBeenCalled();
  });
});
