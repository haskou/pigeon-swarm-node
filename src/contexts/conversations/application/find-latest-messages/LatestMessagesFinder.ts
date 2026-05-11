import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { Message } from '@app/contexts/conversations/domain/Message';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';

import { LatestMessagesFindMessage } from './messages/LatestMessagesFindMessage';

export default class LatestMessagesFinder {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  public async find(message: LatestMessagesFindMessage): Promise<Message[]> {
    const conversation = await this.conversationRepository.findById(
      message.conversationId,
    );

    if (!conversation) {
      throw new ConversationNotFoundError(message.conversationId);
    }

    if (!conversation.hasParticipant(message.requesterIdentityId)) {
      throw new ConversationParticipantNotFoundError();
    }

    return this.conversationRepository.findLatestMessages(
      message.conversationId,
      message.limit,
      message.beforeMessageId,
    );
  }
}
