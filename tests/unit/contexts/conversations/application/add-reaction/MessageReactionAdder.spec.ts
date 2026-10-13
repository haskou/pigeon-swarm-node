import MessageReactionAdder from '@app/contexts/conversations/application/add-reaction/MessageReactionAdder';
import { MessageReactionAddMessage } from '@app/contexts/conversations/application/add-reaction/messages/MessageReactionAddMessage';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';
import { messageProof } from '../../support/messageProof';

describe('MessageReactionAdder', () => {
  let mother: ConversationMother;
  let conversationRepository: MockProxy<ConversationRepository>;
  let reactionRepository: MockProxy<MessageReactionRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let adder: MessageReactionAdder;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversationRepository = mock<ConversationRepository>();
    reactionRepository = mock<MessageReactionRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    adder = new MessageReactionAdder(
      conversationRepository,
      reactionRepository,
      eventPublisher,
    );
  });

  function addMessage(conversation: Conversation): MessageReactionAddMessage {
    return new MessageReactionAddMessage(
      conversation.getId().valueOf(),
      MessageId.generate().valueOf(),
      mother.author.valueOf(),
      '👍',
      messageProof().toPrimitives(),
    );
  }

  it('should add a reaction to a group conversation message', async () => {
    const conversation = mother.buildGroup();

    conversationRepository.requireMetadataById.mockResolvedValue(conversation);
    conversationRepository.hasMessage.mockResolvedValue(true);

    await adder.add(addMessage(conversation));

    expect(reactionRepository.save).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('should reject a reaction in a one-to-one conversation', async () => {
    const conversation = mother.build();

    conversationRepository.requireMetadataById.mockResolvedValue(conversation);
    conversationRepository.hasMessage.mockResolvedValue(true);

    await expect(adder.add(addMessage(conversation))).rejects.toBeInstanceOf(
      OneToOneConversationMessagesNotReplicatedError,
    );
    expect(reactionRepository.save).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
