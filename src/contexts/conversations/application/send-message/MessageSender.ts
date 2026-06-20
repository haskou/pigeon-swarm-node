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
      message.getConversationId(),
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.getConversationId());
    }

    const sentMessage = conversation.sendMessage(
      message.getAuthorIdentityId(),
      message.getEncryptedPayload(),
      message.getSignature(),
      message.getOptions(),
    );

    this.signatureService.assertValidMessageSignature(sentMessage);

    await this.conversationRepository.save(conversation);
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return sentMessage;
  }
}
