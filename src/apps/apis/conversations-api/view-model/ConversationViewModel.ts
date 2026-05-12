import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationResource } from '../resources/ConversationResource';

export class ConversationViewModel {
  constructor(private readonly conversation: Conversation) {}

  public toResource(): ConversationResource {
    const primitives = this.conversation.toPrimitives();

    return {
      id: primitives.id,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      type: 'one-to-one',
    };
  }
}
