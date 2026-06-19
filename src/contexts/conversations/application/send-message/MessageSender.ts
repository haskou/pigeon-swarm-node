import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MessageSignatureDomainService from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { MessageSendMessage } from './messages/MessageSendMessage';

export default class MessageSender {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly signatureService: MessageSignatureDomainService,
  ) {}

  public async send(message: MessageSendMessage): Promise<MessageSent> {
    const conversation = await this.conversationRepository.findById(
      message.conversationId,
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    const sentMessage = conversation.sendMessage(
      message.authorIdentityId,
      message.encryptedPayload,
      message.signature,
      {
        attachmentExternalIdentifiers: message.attachmentExternalIdentifiers,
        createdAt: message.createdAt,
        id: message.id,
        previousMessageIds: message.previousMessageIds,
        replyToMessageId: message.replyToMessageId,
      },
    );

    this.signatureService.assertValidMessageSignature(sentMessage);

    await this.conversationRepository.save(conversation);
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return sentMessage;
  }
}
