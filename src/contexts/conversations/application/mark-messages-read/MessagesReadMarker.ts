import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationMessagesWereReadEvent } from '@app/contexts/conversations/domain/events/ConversationMessagesWereReadEvent';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { MessagesReadMarkMessage } from './messages/MessagesReadMarkMessage';

export default class MessagesReadMarker {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async mark(message: MessagesReadMarkMessage): Promise<void> {
    const conversation = await this.conversationRepository.findMetadataById(
      message.conversationId,
    );

    if (
      !conversation ||
      !conversation.hasParticipant(message.readerIdentityId)
    ) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    await this.conversationRepository.markReadUntil(
      message.conversationId,
      message.readerIdentityId,
      message.messageId,
    );
    await this.eventPublisher.publish([
      new ConversationMessagesWereReadEvent(message.conversationId.valueOf(), {
        messageId: message.messageId.valueOf(),
        networkId: conversation.getNetworkId().valueOf(),
        participantIds: conversation
          .getParticipantIds()
          .map((participantId) => participantId.valueOf()),
        readerIdentityId: message.readerIdentityId.valueOf(),
      }),
    ]);
  }
}
