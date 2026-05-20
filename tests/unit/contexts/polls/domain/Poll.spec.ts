import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PollDuplicateOptionVoteError } from '@app/contexts/polls/domain/errors/PollDuplicateOptionVoteError';
import { PollMultipleVotesNotAllowedError } from '@app/contexts/polls/domain/errors/PollMultipleVotesNotAllowedError';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

describe('Poll', () => {
  const creator = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const voter = new IdentityId(
    'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
  );
  const networkId = new NetworkId('550e8400-e29b-41d4-a716-446655440001');
  const scope = PollScope.communityChannel(
    new CommunityId('community'),
    new CommunityChannelId('channel'),
    networkId,
  );
  const options = [
    PollOption.create(new PollOptionId('a'), new PollOptionText('Option A')),
    PollOption.create(new PollOptionId('b'), new PollOptionText('Option B')),
  ];

  it('creates and records a single-choice vote', () => {
    const poll = Poll.create(
      creator,
      scope,
      new PollQuestion('Choose one'),
      options,
      false,
    );

    poll.castVote(voter, [new PollOptionId('a')]);

    expect(poll.toPrimitives()).toMatchObject({
      allowsMultipleVotes: false,
      creatorIdentityId:
        'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
      ],
      question: 'Choose one',
      status: 'open',
      votes: [
        {
          optionIds: ['a'],
          voterIdentityId:
            'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
        },
      ],
    });
  });

  it('rejects multiple options when the poll is single-choice', () => {
    const poll = Poll.create(
      creator,
      scope,
      new PollQuestion('Choose one'),
      options,
      false,
    );

    expect(() =>
      poll.castVote(voter, [new PollOptionId('a'), new PollOptionId('b')]),
    ).toThrow(PollMultipleVotesNotAllowedError);
  });

  it('rejects duplicate option ids in the same vote', () => {
    const poll = Poll.create(
      creator,
      scope,
      new PollQuestion('Choose any'),
      options,
      true,
    );

    expect(() =>
      poll.castVote(voter, [new PollOptionId('a'), new PollOptionId('a')]),
    ).toThrow(PollDuplicateOptionVoteError);
  });
});
