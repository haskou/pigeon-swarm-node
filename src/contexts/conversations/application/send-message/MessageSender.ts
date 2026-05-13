import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { InvalidMessageSignatureError } from '@app/contexts/conversations/domain/errors/InvalidMessageSignatureError';
import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessageSignatureDomainService } from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { PublicKey } from '@haskou/value-objects';

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

    const isValidSignature = this.signatureService.isValidSignature(
      PublicKey.fromPEM(message.authorIdentityId.toString()),
      sentMessage.toPrimitives(),
      message.signature,
    );

    if (!isValidSignature) {
      throw new InvalidMessageSignatureError();
    }

    await this.conversationRepository.save(conversation);
    await this.conversationRepository.registerUnreadForMessage(
      conversation,
      sentMessage,
    );
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return sentMessage;
  }
}
