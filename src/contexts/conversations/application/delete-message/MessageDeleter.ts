import { MessageDeleted } from '@app/contexts/conversations/domain/entities/messages/MessageDeleted';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { MessageDeleteMessage } from './messages/MessageDeleteMessage';

export default class MessageDeleter {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async delete(message: MessageDeleteMessage): Promise<MessageDeleted> {
    const conversation = await this.conversationRepository.findById(
      message.conversationId,
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    const deletedMessage = conversation.deleteMessage(
      message.authorIdentityId,
      message.targetMessageId,
      message.proof,
      message.createdAt,
      message.id,
    );

    await this.conversationRepository.save(
      conversation,
      new Map([[deletedMessage.getId().valueOf(), message.proof]]),
    );
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return deletedMessage;
  }
}
