import { assert, Timestamp } from '@haskou/value-objects';

import DomainEventPublisher from '../../../../shared/domain/events/DomainEventPublisher';
import { MessageReaction } from '../../domain/entities/messages/MessageReaction';
import { ConversationNotFoundError } from '../../domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '../../domain/errors/ConversationParticipantNotFoundError';
import { MessageTargetNotFoundError } from '../../domain/errors/MessageTargetNotFoundError';
import { ConversationMessageReactionWasRemovedEvent } from '../../domain/events/ConversationMessageReactionWasRemovedEvent';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import MessageReactionRepository from '../../domain/repositories/MessageReactionRepository';
import { MessageReactionRemoveMessage } from './messages/MessageReactionRemoveMessage';

export default class MessageReactionRemover {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly reactionRepository: MessageReactionRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async remove(
    message: MessageReactionRemoveMessage,
  ): Promise<MessageReaction> {
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

    const reaction = MessageReaction.create(
      message.conversationId,
      message.messageId,
      message.authorId,
      message.emoji,
      Timestamp.now(),
    );

    await this.reactionRepository.delete(reaction);
    await this.eventPublisher.publish([
      new ConversationMessageReactionWasRemovedEvent(
        message.conversationId.valueOf(),
        {
          ...reaction.toPrimitives(),
          networkId: conversation.getNetworkId().valueOf(),
          participantIds: conversation.toPrimitives().participantIds,
        },
      ),
    ]);

    return reaction;
  }
}
