import CallRepository from '@app/contexts/calls/domain/repositories/CallRepository';
import LatestMessagesFinder from '@app/contexts/conversations/application/find-latest-messages/LatestMessagesFinder';
import { LatestMessagesFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/LatestMessagesFindMessage';
import { MessageFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/MessageFindMessage';
import { MessagesAroundFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/MessagesAroundFindMessage';
import { ThreadMessagesFindMessage } from '@app/contexts/conversations/application/find-latest-messages/messages/ThreadMessagesFindMessage';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import PollRepository from '@app/contexts/polls/domain/repositories/PollRepository';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';

describe('LatestMessagesFinder', () => {
  let mother: ConversationMother;
  let conversationRepository: MockProxy<ConversationRepository>;
  let finder: LatestMessagesFinder;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversationRepository = mock<ConversationRepository>();
    finder = new LatestMessagesFinder(
      mock<CallRepository>(),
      conversationRepository,
      mock<PollRepository>(),
      mock<MessageReactionRepository>(),
    );
  });

  const reads: Array<
    [
      string,
      (
        finder: LatestMessagesFinder,
        conversation: Conversation,
        requester: string,
      ) => Promise<unknown>,
    ]
  > = [
    [
      'the latest messages',
      (target, conversation, requester) =>
        target.find(
          new LatestMessagesFindMessage(
            conversation.getId().valueOf(),
            requester,
          ),
        ),
    ],
    [
      'one message',
      (target, conversation, requester) =>
        target.findById(
          new MessageFindMessage(
            conversation.getId().valueOf(),
            MessageId.generate().valueOf(),
            requester,
          ),
        ),
    ],
    [
      'the messages around a message',
      (target, conversation, requester) =>
        target.findAround(
          new MessagesAroundFindMessage(
            conversation.getId().valueOf(),
            MessageId.generate().valueOf(),
            requester,
          ),
        ),
    ],
    [
      'a thread',
      (target, conversation, requester) =>
        target.findThread(
          new ThreadMessagesFindMessage(
            conversation.getId().valueOf(),
            MessageId.generate().valueOf(),
            requester,
          ),
        ),
    ],
  ];

  it.each(reads)(
    'should read %s of a group conversation',
    async (_read, read) => {
      const conversation = mother.buildGroup();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await expect(
        read(finder, conversation, mother.author.valueOf()),
      ).resolves.toBeUndefined();
    },
  );

  it.each(reads)(
    'should reject reading %s of a one-to-one conversation',
    async (_read, read) => {
      const conversation = mother.build();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await expect(
        read(finder, conversation, mother.author.valueOf()),
      ).rejects.toBeInstanceOf(OneToOneConversationMessagesNotReplicatedError);
      expect(conversationRepository.findLatestMessages).not.toHaveBeenCalled();
      expect(conversationRepository.requireMessageById).not.toHaveBeenCalled();
      expect(conversationRepository.findMessagesAround).not.toHaveBeenCalled();
      expect(conversationRepository.findThreadMessages).not.toHaveBeenCalled();
    },
  );
});
