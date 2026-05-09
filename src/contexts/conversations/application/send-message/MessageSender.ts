import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { MessageSent } from '@app/contexts/conversations/domain/MessageSent';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { MessageSendMessage } from './messages/MessageSendMessage';

export default class MessageSender {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async send(message: MessageSendMessage): Promise<MessageSent> {
    const conversation = await this.conversationRepository.findById(
      message.conversationId,
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId.valueOf());
    }

    const sentMessage = conversation.sendMessage(
      message.authorIdentityId,
      message.encryptedPayload,
      message.signature,
      message.attachmentExternalIdentifiers,
    );

    await this.conversationRepository.save(conversation);
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return sentMessage;
  }
}
