import MessageReactionRegistrar from '@app/contexts/conversations/application/register-reaction/MessageReactionRegistrar';
import { RegisterMessageReaction } from '@app/contexts/conversations/application/register-reaction/messages/RegisterMessageReaction';
import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { OneToOneConversationMessagesNotReplicatedError } from '@app/contexts/conversations/domain/errors/OneToOneConversationMessagesNotReplicatedError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageReactionRepository from '@app/contexts/conversations/domain/repositories/MessageReactionRepository';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { mock, MockProxy } from 'jest-mock-extended';

import { ConversationMother } from '../../../../mothers/ConversationMother';
import { messageProof } from '../../support/messageProof';

describe('MessageReactionRegistrar', () => {
  let mother: ConversationMother;
  let conversationRepository: MockProxy<ConversationRepository>;
  let reactionRepository: MockProxy<MessageReactionRepository>;
  let registrar: MessageReactionRegistrar;

  beforeEach(async () => {
    mother = await ConversationMother.create();
    conversationRepository = mock<ConversationRepository>();
    reactionRepository = mock<MessageReactionRepository>();
    registrar = new MessageReactionRegistrar(
      conversationRepository,
      reactionRepository,
    );
  });

  function reaction(conversation: Conversation): RegisterMessageReaction {
    return new RegisterMessageReaction(
      conversation.getId().valueOf(),
      MessageId.generate().valueOf(),
      mother.author.valueOf(),
      '👍',
      1780000000000,
      messageProof().toPrimitives(),
    );
  }

  describe('register', () => {
    it('should store a reaction announced for a group conversation', async () => {
      const conversation = mother.buildGroup();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );
      conversationRepository.hasMessage.mockResolvedValue(true);

      await registrar.register(reaction(conversation));

      expect(reactionRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should refuse a reaction announced for a one-to-one conversation', async () => {
      const conversation = mother.build();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );
      conversationRepository.hasMessage.mockResolvedValue(true);

      await expect(
        registrar.register(reaction(conversation)),
      ).rejects.toBeInstanceOf(OneToOneConversationMessagesNotReplicatedError);
      expect(reactionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('unregister', () => {
    it('should delete a reaction removal announced for a group conversation', async () => {
      const conversation = mother.buildGroup();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await registrar.unregister(reaction(conversation));

      expect(reactionRepository.delete).toHaveBeenCalledTimes(1);
    });

    it('should refuse a reaction removal announced for a one-to-one conversation', async () => {
      const conversation = mother.build();

      conversationRepository.requireMetadataById.mockResolvedValue(
        conversation,
      );

      await expect(
        registrar.unregister(reaction(conversation)),
      ).rejects.toBeInstanceOf(OneToOneConversationMessagesNotReplicatedError);
      expect(reactionRepository.delete).not.toHaveBeenCalled();
    });
  });
});
