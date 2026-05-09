import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationsResource } from '../resources/ConversationsResource';
import { ConversationViewModel } from './ConversationViewModel';

export class ConversationsViewModel {
  constructor(private readonly conversations: Conversation[]) {}

  public toResource(): ConversationsResource {
    const lastConversation = this.conversations[this.conversations.length - 1];

    return {
      conversations: this.conversations.map((conversation) =>
        new ConversationViewModel(conversation).toResource(),
      ),
      nextBeforeConversationId: lastConversation?.toPrimitives().id,
    };
  }
}
