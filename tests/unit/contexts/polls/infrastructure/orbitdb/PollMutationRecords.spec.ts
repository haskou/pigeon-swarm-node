import PollMutationRecords from '@app/contexts/polls/infrastructure/orbitdb/PollMutationRecords';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';

const creatorIdentityId =
  'MCowBQYDK2VwAyEAVqz7Fhhakf52gpEbnr//2PWqXYG/RqMhUUe5SE1h1XA=';
const definition = {
  allowsMultipleVotes: false,
  createdAt: 1_780_000_000_000,
  creatorIdentityId,
  id: 'poll-1',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
  ],
  question: 'Which one?',
  scopeType: PollMutationRecords.POLL,
};

describe('PollMutationRecords', () => {
  it('reads a community channel poll definition', () => {
    const poll = PollMutationRecords.pollOf({
      ...definition,
      channelId: 'channel-1',
      communityId: 'community-1',
    });

    expect(poll.getScope().toPrimitives()).toMatchObject({
      channelId: 'channel-1',
      communityId: 'community-1',
    });
  });

  it('rejects a poll, ballot or close scoped to a conversation', () => {
    const conversationScope = { conversationId: 'group:conversation-1' };

    expect(() =>
      PollMutationRecords.pollOf({ ...definition, ...conversationScope }),
    ).toThrow(InvalidPublicMutationError);
    expect(() =>
      PollMutationRecords.voteOf({
        ...conversationScope,
        createdAt: 1_780_000_000_000,
        id: PollMutationRecords.voteId('poll-1', creatorIdentityId),
        optionIds: ['a'],
        pollId: 'poll-1',
        scopeType: PollMutationRecords.VOTE,
        voterIdentityId: creatorIdentityId,
      }),
    ).toThrow(InvalidPublicMutationError);
    expect(() =>
      PollMutationRecords.closeOf({
        ...conversationScope,
        closedByIdentityId: creatorIdentityId,
        createdAt: 1_780_000_000_000,
        id: PollMutationRecords.closeId('poll-1'),
        pollId: 'poll-1',
        scopeType: PollMutationRecords.CLOSE,
      }),
    ).toThrow(InvalidPublicMutationError);
  });
});
