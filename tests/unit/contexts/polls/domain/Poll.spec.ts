import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PollDuplicateOptionVoteError } from '@app/contexts/polls/domain/errors/PollDuplicateOptionVoteError';
import { PollAlreadyClosedError } from '@app/contexts/polls/domain/errors/PollAlreadyClosedError';
import { PollMultipleVotesNotAllowedError } from '@app/contexts/polls/domain/errors/PollMultipleVotesNotAllowedError';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';

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

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('records a creation event with poll payload and routing recipients', () => {
    const poll = Poll.create(
      creator,
      scope,
      new PollQuestion('Choose one'),
      options,
      false,
      undefined,
      { memberIds: [creator.valueOf(), voter.valueOf()] },
    );
    const events = poll.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0].eventName()).toBe('polls.v1.poll.was_created');
    expect(JSON.parse(events[0].decode())).toMatchObject({
      aggregate_id: scope.aggregateId(),
      attributes: {
        memberIds: [creator.valueOf(), voter.valueOf()],
        poll: {
          question: 'Choose one',
        },
        pollId: poll.getId().valueOf(),
      },
      type: 'polls.v1.poll.was_created',
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

  it('rejects votes after the expiration time', () => {
    const poll = Poll.create(
      creator,
      scope,
      new PollQuestion('Choose one'),
      options,
      false,
      new Timestamp(Date.now() - 1),
    );

    expect(() => poll.castVote(voter, [new PollOptionId('a')])).toThrow(
      PollAlreadyClosedError,
    );
    expect(poll.toPrimitives().status).toBe('closed');
  });

  it('accepts votes at the exact expiration time', () => {
    const now = Date.now();

    jest.spyOn(Date, 'now').mockReturnValue(now);

    const poll = Poll.create(
      creator,
      scope,
      new PollQuestion('Choose one'),
      options,
      false,
      new Timestamp(now),
    );

    poll.castVote(voter, [new PollOptionId('a')]);

    expect(poll.toPrimitives().status).toBe('open');
    expect(poll.toPrimitives().votes).toHaveLength(1);
  });
});
