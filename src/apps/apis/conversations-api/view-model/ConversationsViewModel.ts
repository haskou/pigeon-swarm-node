import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationsResource } from '../resources/ConversationsResource';
import { ConversationViewModel } from './ConversationViewModel';

export class ConversationsViewModel {
  constructor(
    private readonly conversations: Conversation[],
    private readonly unreadCounts: Map<string, number> = new Map(),
  ) {}

  public toResource(): ConversationsResource {
    const lastConversation = this.conversations[this.conversations.length - 1];

    return {
      conversations: this.conversations.map((conversation) =>
        new ConversationViewModel(
          conversation,
          this.unreadCounts.get(conversation.getId().valueOf()) ?? 0,
        ).toResource(),
      ),
      nextBeforeConversationId: lastConversation?.toPrimitives().id,
    };
  }
}
