import { MessageEdited } from '@app/contexts/conversations/domain/entities/messages/MessageEdited';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessageEditOptions } from '@app/contexts/conversations/domain/value-objects/MessageEditOptions';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { MessageEditMessage } from './messages/MessageEditMessage';

export default class MessageEditor {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async edit(message: MessageEditMessage): Promise<MessageEdited> {
    const conversation = await this.conversationRepository.findById(
      message.conversationId,
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    const editedMessage = conversation.editMessage(
      message.authorIdentityId,
      message.targetMessageId,
      message.encryptedPayload,
      message.proof,
      new MessageEditOptions(
        message.createdAt,
        message.id,
        message.previousMessageIds,
      ),
    );

    await this.conversationRepository.save(
      conversation,
      new Map([[editedMessage.getId().valueOf(), message.proof]]),
    );
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return editedMessage;
  }
}
