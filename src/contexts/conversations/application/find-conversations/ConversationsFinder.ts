import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';

import { ConversationsFindMessage } from './messages/ConversationsFindMessage';

export default class ConversationsFinder {
  constructor(private readonly repository: ConversationRepository) {}

  public async find(
    message: ConversationsFindMessage,
  ): Promise<Conversation[]> {
    return this.repository.findByParticipant(
      message.requesterIdentityId,
      message.limit,
      message.beforeConversationId,
    );
  }
}
