import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationResource } from '../resources/ConversationResource';

export class ConversationViewModel {
  constructor(private readonly conversation: Conversation) {}

  /**
   * Every conversation the node knows is 1:1, which has no admins. `type` and
   * the empty `adminIds` stay because clients still require them.
   */
  public toResource(): ConversationResource {
    const primitives = this.conversation.toPrimitives();

    return {
      adminIds: [],
      creatorId: primitives.creatorId,
      id: primitives.id,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      type: 'one-to-one',
    };
  }
}
