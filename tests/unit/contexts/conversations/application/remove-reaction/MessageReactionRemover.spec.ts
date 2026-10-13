import MessageReactionRemover from '@app/contexts/conversations/application/remove-reaction/MessageReactionRemover';
import { MessageReactionRemoveMessage } from '@app/contexts/conversations/application/remove-reaction/messages/MessageReactionRemoveMessage';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';
import { messageProof } from '../../support/messageProof';

describe('MessageReactionRemover', () => {
  let mother: ConversationMother;
  let conversationRepository: MockProxy<ConversationRepository>;
  let reactionRepository: MockProxy<MessageReactionRepository>;
  let eventPublisher: MockProxy<DomainEventPublisher>;
  let remover: MessageReactionRemover;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversationRepository = mock<ConversationRepository>();
    reactionRepository = mock<MessageReactionRepository>();
    eventPublisher = mock<DomainEventPublisher>();
    remover = new MessageReactionRemover(
      conversationRepository,
      reactionRepository,
      eventPublisher,
    );
  });

  function removeMessage(
    conversation: Conversation,
  ): MessageReactionRemoveMessage {
    return new MessageReactionRemoveMessage(
      conversation.getId().valueOf(),
      MessageId.generate().valueOf(),
      mother.author.valueOf(),
      '👍',
      messageProof().toPrimitives(),
    );
  }

  it('should remove a reaction from a group conversation message', async () => {
    const conversation = mother.buildGroup();

    conversationRepository.requireMetadataById.mockResolvedValue(conversation);
    conversationRepository.hasMessage.mockResolvedValue(true);

    await remover.remove(removeMessage(conversation));

    expect(reactionRepository.delete).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('should reject removing a reaction in a one-to-one conversation', async () => {
    const conversation = mother.build();

    conversationRepository.requireMetadataById.mockResolvedValue(conversation);
    conversationRepository.hasMessage.mockResolvedValue(true);

    await expect(
      remover.remove(removeMessage(conversation)),
    ).rejects.toBeInstanceOf(OneToOneConversationMessagesNotReplicatedError);
    expect(reactionRepository.delete).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
