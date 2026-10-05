import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PollVoteCastMessage } from '@app/contexts/polls/application/cast-vote/messages/PollVoteCastMessage';
import { PollVoteCaster } from '@app/contexts/polls/application/cast-vote/PollVoteCaster';
import { PollCloseMessage } from '@app/contexts/polls/application/close/messages/PollCloseMessage';
import { PollCloser } from '@app/contexts/polls/application/close/PollCloser';
import { PollCreateMessage } from '@app/contexts/polls/application/create/messages/PollCreateMessage';
import { PollCreator } from '@app/contexts/polls/application/create/PollCreator';
import { PollFindMessage } from '@app/contexts/polls/application/find/messages/PollFindMessage';
import PollFinder from '@app/contexts/polls/application/find/PollFinder';
import { PollTimelineMessageRegisterMessage } from '@app/contexts/polls/application/register-timeline-message/messages/PollTimelineMessageRegisterMessage';
import PollTimelineMessageRegistrar from '@app/contexts/polls/application/register-timeline-message/PollTimelineMessageRegistrar';
import { PollVoteRemoveMessage } from '@app/contexts/polls/application/remove-vote/messages/PollVoteRemoveMessage';
import { PollVoteRemover } from '@app/contexts/polls/application/remove-vote/PollVoteRemover';
import { PollNotFoundError } from '@app/contexts/polls/domain/errors/PollNotFoundError';
import { Poll } from '@app/contexts/polls/domain/Poll';
import { PollAudience } from '@app/contexts/polls/domain/PollAudience';
import { PollOption } from '@app/contexts/polls/domain/PollOption';
import { PollScope } from '@app/contexts/polls/domain/PollScope';
import PollRepository from '@app/contexts/polls/domain/repositories/PollRepository';
import { PollId } from '@app/contexts/polls/domain/value-objects/PollId';
import { PollOptionId } from '@app/contexts/polls/domain/value-objects/PollOptionId';
import { PollOptionText } from '@app/contexts/polls/domain/value-objects/PollOptionText';
import { PollQuestion } from '@app/contexts/polls/domain/value-objects/PollQuestion';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { Timestamp } from '@haskou/value-objects';
import { mock } from 'jest-mock-extended';

import { StickerMutationMother } from '../../../mothers/StickerMutationMother';

const creatorIdentityId =
  'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=';
const voterIdentityId =
  'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=';
const audience = PollAudience.communityChannel();
const createdAt = 1_700_000_000_000;
const proof = async (kind: 'put' | 'delete' = 'put') =>
  StickerMutationMother.create('polls', kind);

describe('Poll application use cases', () => {
  it('PollCreator persists a new poll and publishes its event', async () => {
    const repository = mock<PollRepository>();
    const publisher = mock<DomainEventPublisher>();
    const createProof = await proof();

    const poll = await new PollCreator(repository, publisher).create(
      new PollCreateMessage(
        'poll-1',
        creatorIdentityId,
        pollScope(),
        'Choose one',
        [
          { id: 'a', text: 'Option A' },
          { id: 'b', text: 'Option B' },
        ],
        false,
        audience,
        createdAt,
        createProof,
      ),
    );

    expect(poll.getId().valueOf()).toBe('poll-1');
    expect(poll.getCreatedAt().valueOf()).toBe(createdAt);
    expect(repository.save).toHaveBeenCalledWith(poll, expect.anything());
    expect(publisher.publish).toHaveBeenCalledWith([
      expect.objectContaining({ aggregateId: 'community-1' }),
    ]);
  });

  it('PollFinder returns a stored poll and rejects a missing one', async () => {
    const repository = mock<PollRepository>();
    const poll = createPoll();
    const message = new PollFindMessage(poll.getId().valueOf());

    repository.findById
      .mockResolvedValueOnce(poll)
      .mockResolvedValueOnce(undefined);

    await expect(new PollFinder(repository).find(message)).resolves.toBe(poll);
    await expect(
      new PollFinder(repository).find(message),
    ).rejects.toBeInstanceOf(PollNotFoundError);
  });

  it('PollVoteCaster persists a vote and publishes its integration event', async () => {
    const repository = mock<PollRepository>();
    const publisher = mock<DomainEventPublisher>();
    const poll = createPoll();

    repository.findById.mockResolvedValue(poll);

    await expect(
      new PollVoteCaster(repository, publisher).cast(
        new PollVoteCastMessage(
          poll.getId().valueOf(),
          voterIdentityId,
          ['a'],
          audience,
          createdAt,
          await proof(),
        ),
      ),
    ).resolves.toBe(poll);
    expect(repository.saveVote).toHaveBeenCalledWith(
      poll,
      new IdentityId(voterIdentityId),
      expect.anything(),
    );
    expect(publisher.publish).toHaveBeenCalledWith([expect.any(Object)]);
  });

  it('PollVoteRemover persists vote removal and publishes its event', async () => {
    const repository = mock<PollRepository>();
    const publisher = mock<DomainEventPublisher>();
    const poll = createPoll();

    poll.castVote(
      new IdentityId(voterIdentityId),
      [new PollOptionId('a')],
      new Timestamp(createdAt),
    );
    repository.findById.mockResolvedValue(poll);

    await expect(
      new PollVoteRemover(repository, publisher).remove(
        new PollVoteRemoveMessage(
          poll.getId().valueOf(),
          voterIdentityId,
          audience,
          await proof('delete'),
        ),
      ),
    ).resolves.toBe(poll);
    expect(repository.saveVote).toHaveBeenCalledWith(
      poll,
      new IdentityId(voterIdentityId),
      expect.anything(),
    );
    expect(poll.toPrimitives().votes).toEqual([]);
    expect(publisher.publish).toHaveBeenCalledWith([expect.any(Object)]);
  });

  it('PollCloser persists closure and publishes its event', async () => {
    const repository = mock<PollRepository>();
    const publisher = mock<DomainEventPublisher>();
    const poll = createPoll();

    repository.findById.mockResolvedValue(poll);

    await expect(
      new PollCloser(repository, publisher).close(
        new PollCloseMessage(
          poll.getId().valueOf(),
          creatorIdentityId,
          audience,
          createdAt,
          await proof(),
        ),
      ),
    ).resolves.toBe(poll);
    expect(repository.saveClose).toHaveBeenCalledWith(
      poll,
      new IdentityId(creatorIdentityId),
      new Timestamp(createdAt),
      expect.anything(),
    );
    expect(poll.toPrimitives().status).toBe('closed');
    expect(publisher.publish).toHaveBeenCalledWith([expect.any(Object)]);
  });

  it('vote and close mutations reject a missing poll without persistence', async () => {
    const repository = mock<PollRepository>();
    const publisher = mock<DomainEventPublisher>();
    const missingPollId = 'missing-poll';

    repository.findById.mockResolvedValue(undefined);

    await expect(
      new PollVoteCaster(repository, publisher).cast(
        new PollVoteCastMessage(
          missingPollId,
          voterIdentityId,
          ['a'],
          audience,
          createdAt,
          await proof(),
        ),
      ),
    ).rejects.toBeInstanceOf(PollNotFoundError);
    await expect(
      new PollVoteRemover(repository, publisher).remove(
        new PollVoteRemoveMessage(
          missingPollId,
          voterIdentityId,
          audience,
          await proof('delete'),
        ),
      ),
    ).rejects.toBeInstanceOf(PollNotFoundError);
    await expect(
      new PollCloser(repository, publisher).close(
        new PollCloseMessage(
          missingPollId,
          creatorIdentityId,
          audience,
          createdAt,
          await proof(),
        ),
      ),
    ).rejects.toBeInstanceOf(PollNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.saveVote).not.toHaveBeenCalled();
    expect(repository.saveClose).not.toHaveBeenCalled();
  });

  it('PollTimelineMessageRegistrar adds a poll to a conversation timeline', async () => {
    const conversationRepository = mock<ConversationRepository>();
    const communityRepository = mock<CommunityChannelMessageRepository>();
    const conversation = mock<Conversation>();
    const conversationScope = PollScope.groupConversation(
      new ConversationId('conversation-1'),
    );
    const conversationPoll = Poll.create(
      new PollId('poll-2'),
      new IdentityId(creatorIdentityId),
      conversationScope,
      new PollQuestion('Choose one'),
      pollOptions(),
      false,
      new Timestamp(createdAt),
    );

    conversationRepository.findById.mockResolvedValue(conversation);

    await new PollTimelineMessageRegistrar(
      conversationRepository,
      communityRepository,
    ).register(
      new PollTimelineMessageRegisterMessage(
        creatorIdentityId,
        conversationPoll,
        Buffer.alloc(64).toString('base64'),
      ),
    );

    expect(conversation.addPollMessage).toHaveBeenCalledTimes(1);
    expect(conversationRepository.save).toHaveBeenCalledWith(conversation);
    expect(communityRepository.save).not.toHaveBeenCalled();
  });
});

function pollScope(): PollScope {
  return PollScope.communityChannel(
    new CommunityId('community-1'),
    new CommunityChannelId('channel-1'),
  );
}

function pollOptions(): PollOption[] {
  return [
    PollOption.create(new PollOptionId('a'), new PollOptionText('Option A')),
    PollOption.create(new PollOptionId('b'), new PollOptionText('Option B')),
  ];
}

function createPoll(): Poll {
  return Poll.create(
    new PollId('poll-1'),
    new IdentityId(creatorIdentityId),
    pollScope(),
    new PollQuestion('Choose one'),
    pollOptions(),
    false,
    new Timestamp(createdAt),
  );
}
