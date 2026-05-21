import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { InvalidMessageSignatureError } from '@app/contexts/conversations/domain/errors/InvalidMessageSignatureError';
import { MessageEdited } from '@app/contexts/conversations/domain/MessageEdited';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { MessageSignatureDomainService } from '@app/contexts/conversations/domain/services/MessageSignatureDomainService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import { PublicKey } from '@haskou/value-objects';

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
      {
        createdAt: message.createdAt,
        id: message.id,
        previousMessageIds: message.previousMessageIds,
      },
    );

    const isValidSignature = this.signatureService.isValidSignature(
      PublicKey.fromPEM(message.authorIdentityId.toString()),
      editedMessage.toPrimitives(),
      message.signature,
    );

    if (!isValidSignature) {
      throw new InvalidMessageSignatureError();
    }

    await this.conversationRepository.save(conversation);
    await this.conversationRepository.registerUnreadForMessage(
      conversation,
      editedMessage,
    );
    await this.eventPublisher.publish(conversation.pullDomainEvents());

    return editedMessage;
  }
}
