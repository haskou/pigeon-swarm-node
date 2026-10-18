import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationsResource } from '../resources/ConversationsResource';
import { ConversationViewModel } from './ConversationViewModel';

export class ConversationsViewModel {
  constructor(
    private readonly conversations: Conversation[],
    private readonly nextCursor: string | null,
  ) {}

  public toResource(): ConversationsResource {
    return {
      conversations: this.conversations.map((conversation) =>
        new ConversationViewModel(conversation).toResource(),
      ),
      nextCursor: this.nextCursor,
    };
  }
}
