import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';

import { ConversationsUnreadCountMessage } from './messages/ConversationsUnreadCountMessage';

export default class ConversationUnreadCounter {
  constructor(private readonly repository: ConversationRepository) {}

  public count(
    message: ConversationsUnreadCountMessage,
  ): Promise<Map<string, number>> {
    return this.repository.countUnreadByRecipient(
      message.requesterIdentityId,
      message.conversationIds,
    );
  }
}
