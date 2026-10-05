import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import OrbitDBPollRepository from '@app/contexts/polls/infrastructure/orbitdb/OrbitDBPollRepository';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { signedMutation } from '../../../public-mutations/support/signedMutation';

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
  let communityRepository: MockProxy<CommunityRepository>;
  let conversationRepository: MockProxy<ConversationRepository>;
  let publicStorageGuard: PrivateCommunityPublicStorageGuard;

  function poll(scope: 'community_channel' | 'group_conversation'): Poll {
    return Poll.create(
      new PollId(`poll-${scope === 'community_channel' ? 'c' : 'g'}`),
      new IdentityId(creatorIdentityId),
      scope === 'community_channel'
        ? PollScope.communityChannel(communityId, channelId)
        : PollScope.groupConversation(conversationId),
      new PollQuestion('Question?'),
      [
        PollOption.create(new PollOptionId('yes-1'), new PollOptionText('Yes')),
        PollOption.create(new PollOptionId('no-1'), new PollOptionText('No')),
      ],
      false,
      new Timestamp(1_780_000_000_000),
    );
  }

  function proofFor(
    recordId: string,
    kind: 'put' | 'delete' = 'put',
    sequence = 1,
  ) {
    return signedMutation({
      identityId: creatorIdentityId,
      kind,
      recordId,
      sequence,
      store: 'polls',
    });
  }

  async function saveVote(
    target: Poll,
    optionId: string | undefined,
    sequence: number,
    at = 1_780_000_000_100,
  ): Promise<void> {
    const voter = new IdentityId(creatorIdentityId);

    if (optionId) {
      target.castVote(voter, [new PollOptionId(optionId)], new Timestamp(at));
    } else {
      target.removeVote(voter);
    }
    await repository.saveVote(
      target,
      voter,
      await proofFor(
        `poll-vote:${target.getId().valueOf()}:${creatorIdentityId}`,
        optionId ? 'put' : 'delete',
        sequence,
      ),
    );
  }

  beforeEach(() => {
    polls = createStore();
    registry = new OrbitDBReplicatedStateRegistry();
    communityRepository = mock<CommunityRepository>();
    conversationRepository = mock<ConversationRepository>();
    publicStorageGuard = new PrivateCommunityPublicStorageGuard(
      {
        findScope: jest.fn().mockResolvedValue(undefined),
      } as never,
      new PrivateAuthorizationStorageCoordinator(),
    );
    registry.register(networkId, {
      heads: createStore(),
      polls,
    } as never);
    communityRepository.findById.mockResolvedValue({
      toPrimitives: () => ({ networkId }),
    } as never);
    conversationRepository.findMetadataById.mockResolvedValue({
      toPrimitives: () => ({ networkId }),
    } as never);
    repository = new OrbitDBPollRepository(
      registry,
      communityRepository,
      conversationRepository,
      publicStorageGuard,
    );
  });

  afterEach(() => {
    registry.clear();
  });

  async function save(target: Poll): Promise<void> {
    await repository.save(target, await proofFor(target.getId().valueOf()));
  }

  it('reads community channel polls from the scope index after saving', async () => {
    const savedPoll = poll('community_channel');

    await save(savedPoll);
    const storedDocument = await polls.get(savedPoll.getId().valueOf());

    const result = await repository.findByCommunityChannel(
      communityId,
      channelId,
      10,
    );

    expect(result.map((item) => item.toPrimitives().id)).toEqual([
      savedPoll.getId().valueOf(),
    ]);
    expect(storedDocument).toMatchObject({
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      scopeType: 'poll',
    });
    expect(storedDocument).toHaveProperty('proof');
    expect(storedDocument).not.toHaveProperty('votes');
    expect(storedDocument).not.toHaveProperty('status');
  });

  it('reads group conversation polls from the scope index after saving', async () => {
    const savedPoll = poll('group_conversation');

    await save(savedPoll);

    const result = await repository.findByGroupConversation(conversationId, 10);

    expect(result.map((item) => item.toPrimitives().id)).toEqual([
      savedPoll.getId().valueOf(),
    ]);
    expect(conversationRepository.findMetadataById).toHaveBeenCalledWith(
      conversationId,
    );
  });

  it('replays ballots, a replaced ballot and a tombstone over the poll', async () => {
    const savedPoll = poll('community_channel');

    await save(savedPoll);
    await saveVote(savedPoll, 'yes-1', 1);
    await saveVote(savedPoll, 'no-1', 2, 1_780_000_000_200);

    const [voted] = await repository.findByCommunityChannel(
      communityId,
      channelId,
      10,
    );

    expect(voted.toPrimitives().votes).toEqual([
      {
        createdAt: 1_780_000_000_200,
        optionIds: ['no-1'],
        voterIdentityId: creatorIdentityId,
      },
    ]);

    await saveVote(savedPoll, undefined, 3);

    const loaded = await repository.findById(savedPoll.getId());

    expect(loaded?.toPrimitives().votes).toEqual([]);
  });

  it('closes a poll and ignores ballots cast after the close', async () => {
    const savedPoll = poll('community_channel');

    await save(savedPoll);
    await saveVote(savedPoll, 'yes-1', 1, 1_780_000_000_500);
    const closer = new IdentityId(creatorIdentityId);
    const closedAt = new Timestamp(1_780_000_000_300);
    const closing = poll('community_channel');

    closing.close(closedAt);
    await repository.saveClose(
      closing,
      closer,
      closedAt,
      await proofFor(`poll-close:${savedPoll.getId().valueOf()}`),
    );

    const loaded = await repository.findById(savedPoll.getId());

    expect(loaded?.toPrimitives().status).toBe('closed');
    expect(loaded?.toPrimitives().votes).toEqual([]);
  });

  it('rejects a stale ballot', async () => {
    const savedPoll = poll('community_channel');

    await save(savedPoll);
    await saveVote(savedPoll, 'yes-1', 2);

    await expect(saveVote(savedPoll, 'no-1', 1)).rejects.toThrow();
  });

  it('ignores a ballot recorded for another scope', async () => {
    const savedPoll = poll('community_channel');

    await save(savedPoll);
    const foreign = PollScope.communityChannel(
      communityId,
      new CommunityChannelId('channel-2'),
    );
    const forged = Poll.fromPrimitives({
      ...savedPoll.toPrimitives(),
      scope: foreign.toPrimitives(),
    });
    const voter = new IdentityId(creatorIdentityId);

    forged.castVote(
      voter,
      [new PollOptionId('yes-1')],
      new Timestamp(1_780_000_000_100),
    );
    await repository.saveVote(
      forged,
      voter,
      await proofFor(
        `poll-vote:${savedPoll.getId().valueOf()}:${creatorIdentityId}`,
      ),
    );

    const loaded = await repository.findById(savedPoll.getId());

    expect(loaded?.toPrimitives().votes).toEqual([]);
  });

  it('resolves the community network before acquiring its public storage lock', async () => {
    let activeScope: string | undefined;
    const coordinator = mock<PrivateAuthorizationStorageCoordinator>();

    coordinator.exclusively.mockImplementation(async (scopeId, action) => {
      if (activeScope === scopeId) throw new Error('Reentrant scope lock');
      activeScope = scopeId;

      try {
        return await action();
      } finally {
        activeScope = undefined;
      }
    });
    communityRepository.findById.mockImplementation((id) =>
      coordinator.exclusively(
        id.valueOf(),
        async () =>
          ({
            toPrimitives: () => ({ networkId }),
          }) as never,
      ),
    );
    repository = new OrbitDBPollRepository(
      registry,
      communityRepository,
      conversationRepository,
      new PrivateCommunityPublicStorageGuard(
        { findScope: jest.fn().mockResolvedValue(undefined) } as never,
        coordinator,
      ),
    );

    await expect(save(poll('community_channel'))).resolves.toBe(undefined);
  });

  it('rejects protected community polls before publishing them', async () => {
    repository = new OrbitDBPollRepository(
      registry,
      communityRepository,
      conversationRepository,
      new PrivateCommunityPublicStorageGuard(
        {
          findScope: jest.fn().mockResolvedValue({}),
        } as never,
        new PrivateAuthorizationStorageCoordinator(),
      ),
    );

    await expect(save(poll('community_channel'))).rejects.toThrow(
      'Invalid private authorization',
    );
    expect(polls.put).not.toHaveBeenCalled();
  });

  it('ignores definitions with malformed identities', async () => {
    await polls.put({
      allowsMultipleVotes: false,
      channelId: channelId.valueOf(),
      communityId: communityId.valueOf(),
      createdAt: 1780000000000,
      creatorIdentityId: 'malformed-public-key',
      id: 'malformed-poll',
      options: [
        { id: 'yes-1', text: 'Yes' },
        { id: 'no-1', text: 'No' },
      ],
      question: 'Question?',
      scopeType: 'poll',
    });

    await expect(
      repository.findByCommunityChannel(communityId, channelId, 10),
    ).resolves.toEqual([]);
  });
});
