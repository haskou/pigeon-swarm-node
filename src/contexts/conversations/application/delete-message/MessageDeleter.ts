import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { InvalidMessageSignatureError } from '@app/contexts/conversations/domain/errors/InvalidMessageSignatureError';
import { MessageDeleted } from '@app/contexts/conversations/domain/MessageDeleted';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessageSignatureDomainService } from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { PublicKey } from '@haskou/value-objects';

import { MessageDeleteMessage } from './messages/MessageDeleteMessage';

export default class MessageDeleter {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly signatureService: MessageSignatureDomainService,
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
      message.signature,
      message.createdAt,
      message.id,
    );

    const isValidSignature = this.signatureService.isValidSignature(
      PublicKey.fromPEM(message.authorIdentityId.toString()),
      deletedMessage.toPrimitives(),
      message.signature,
    );

    if (!isValidSignature) {
      throw new InvalidMessageSignatureError();
    }

    await this.conversationRepository.save(conversation);
    await this.conversationRepository.registerUnreadForMessage(
      conversation,
      deletedMessage,
    );
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return deletedMessage;
  }
}
