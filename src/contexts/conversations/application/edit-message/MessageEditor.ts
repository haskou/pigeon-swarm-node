import { MessageEdited } from '@app/contexts/conversations/domain/entities/messages/MessageEdited';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageSignatureDomainService from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import { MessageEditOptions } from '@app/contexts/conversations/domain/value-objects/MessageEditOptions';
import { DomainEventPublisher } from '@haskou/ddd-kernel/domain';

import { MessageEditMessage } from './messages/MessageEditMessage';

export default class MessageEditor {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly signatureService: MessageSignatureDomainService,
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
      message.signature,
      new MessageEditOptions(
        message.createdAt,
        message.id,
        message.previousMessageIds,
      ),
    );

    this.signatureService.assertValidMessageSignature(editedMessage);

    await this.conversationRepository.save(conversation);
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return editedMessage;
  }
}
