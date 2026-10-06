import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationResource } from '../resources/ConversationResource';

export class ConversationViewModel {
  constructor(
    private readonly conversation: Conversation,
    private readonly unreadCount = 0,
  ) {}

  public toResource(): ConversationResource {
    const primitives = this.conversation.toPrimitives();

    return {
      adminIds: primitives.adminIds,
      creatorId: primitives.creatorId,
      id: primitives.id,
      name: primitives.name,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      type: primitives.type,
      unreadCount: this.unreadCount,
    };
  }
}
