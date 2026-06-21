import { assert } from '@haskou/value-objects';

import { MessageReaction } from '../../domain/entities/messages/MessageReaction';
import { ConversationNotFoundError } from '../../domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '../../domain/errors/ConversationParticipantNotFoundError';
import { MessageTargetNotFoundError } from '../../domain/errors/MessageTargetNotFoundError';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import MessageReactionRepository from '../../domain/repositories/MessageReactionRepository';
import { RegisterMessageReaction } from './messages/RegisterMessageReaction';

export default class MessageReactionRegistrar {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly reactionRepository: MessageReactionRepository,
  ) {}

  public async register(message: RegisterMessageReaction): Promise<void> {
    const conversation = await this.conversationRepository.findMetadataById(
      message.conversationId,
    );

    assert(conversation, new ConversationNotFoundError(message.conversationId));
    assert(
      conversation?.hasParticipant(message.authorId),
      new ConversationParticipantNotFoundError(),
    );
    assert(
      await this.conversationRepository.hasMessage(
        message.conversationId,
        message.messageId,
      ),
      new MessageTargetNotFoundError(),
    );

    await this.reactionRepository.save(
      MessageReaction.create(
        message.conversationId,
        message.messageId,
        message.authorId,
        message.emoji,
        message.createdAt,
      ),
    );
  }

  public async unregister(message: RegisterMessageReaction): Promise<void> {
    await this.reactionRepository.delete(
      MessageReaction.create(
        message.conversationId,
        message.messageId,
        message.authorId,
        message.emoji,
        message.createdAt,
      ),
    );
  }
}
