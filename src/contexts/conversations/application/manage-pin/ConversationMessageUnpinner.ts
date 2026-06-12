import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { ConversationMessageWasUnpinnedEvent } from '../../domain/events/ConversationMessageWasUnpinnedEvent';
import ConversationMessagePinRepository from '../../domain/repositories/ConversationMessagePinRepository';
import ConversationMessagePinAccess from './ConversationMessagePinAccess';
import { ConversationMessagePinDeleteMessage } from './messages/ConversationMessagePinDeleteMessage';

export default class ConversationMessageUnpinner {
  constructor(
    private readonly pinRepository: ConversationMessagePinRepository,
    private readonly access: ConversationMessagePinAccess,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async unpin(
    message: ConversationMessagePinDeleteMessage,
  ): Promise<void> {
    const conversation = await this.access.findReadableConversation(
      message.conversationId,
      message.identityId,
    );

    await this.pinRepository.unpin(message.conversationId, message.messageId);

    const conversationPrimitives = conversation.toPrimitives();

    await this.eventPublisher.publish([
      new ConversationMessageWasUnpinnedEvent(
        message.conversationId.valueOf(),
        {
          messageId: message.messageId.valueOf(),
          networkId: conversationPrimitives.networkId,
          participantIds: conversationPrimitives.participantIds,
          unpinnedByIdentityId: message.identityId.valueOf(),
        },
      ),
    ]);
  }
}
