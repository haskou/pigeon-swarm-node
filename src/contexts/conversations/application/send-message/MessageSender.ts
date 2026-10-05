import { MessageSent } from '@app/contexts/conversations/domain/entities/messages/MessageSent';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { MessageSendMessage } from './messages/MessageSendMessage';

export default class MessageSender {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
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
      message.getProof(),
      message.getOptions(),
    );

    await this.conversationRepository.save(
      conversation,
      new Map([[sentMessage.getId().valueOf(), message.getProof()]]),
    );
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return sentMessage;
  }
}
