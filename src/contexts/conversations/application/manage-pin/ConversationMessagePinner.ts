import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { MessageTargetNotFoundError } from '../../domain/errors/MessageTargetNotFoundError';
import ConversationMessagePinRepository from '../../domain/repositories/ConversationMessagePinRepository';
import ConversationRepository from '../../domain/repositories/ConversationRepository';
import ConversationMessagePinAccess from './ConversationMessagePinAccess';
import { ConversationMessagePinCreateMessage } from './messages/ConversationMessagePinCreateMessage';

export default class ConversationMessagePinner {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly pinRepository: ConversationMessagePinRepository,
    private readonly access: ConversationMessagePinAccess,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async pin(
    message: ConversationMessagePinCreateMessage,
  ): Promise<void> {
    const conversation = await this.access.findReadableConversation(
      message.conversationId,
      message.identityId,
    );
    const pinnedMessage = await this.conversationRepository.findMessageById(
      message.conversationId,
      message.messageId,
    );

    if (!pinnedMessage) {
      throw new MessageTargetNotFoundError();
    }

    await this.pinRepository.pin(
      message.conversationId,
      message.messageId,
      message.identityId,
    );

    conversation.pinMessage(message.identityId, message.messageId);

    await this.eventPublisher.publish(conversation.pullDomainEvents());
  }
}
