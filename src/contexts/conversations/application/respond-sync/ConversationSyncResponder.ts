import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { ConversationSyncAvailableEvent } from '../../domain/events/ConversationSyncAvailableEvent';
import { ConversationRepository } from '../../domain/repositories/ConversationRepository';
import { ConversationSyncResponseMessage } from './messages/ConversationSyncResponseMessage';

export default class ConversationSyncResponder {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async respond(
    message: ConversationSyncResponseMessage,
  ): Promise<void> {
    const conversation = await this.repository.findById(message.conversationId);

    if (!conversation) {
      return;
    }

    const messages = conversation.toPrimitives().messages;

    await this.eventPublisher.publish([
      new ConversationSyncAvailableEvent(message.conversationId.valueOf(), {
        messageCandidates: messages.map((conversationMessage) => ({
          authorIdentityId: conversationMessage.authorId,
          createdAt: conversationMessage.createdAt,
          messageId: conversationMessage.id,
          messageType: conversationMessage.type,
        })),
        requestId: message.requestId,
      }),
    ]);
  }
}
