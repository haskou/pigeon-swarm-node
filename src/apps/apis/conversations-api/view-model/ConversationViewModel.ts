import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationResource } from '../resources/ConversationResource';

export class ConversationViewModel {
  constructor(private readonly conversation: Conversation) {}

  public toResource(): ConversationResource {
    return this.conversation.toPrimitives();
  }
}
