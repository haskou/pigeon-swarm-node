import { Conversation } from '@app/contexts/conversations/domain/Conversation';

import { ConversationResource } from '../resources/ConversationResource';

export class ConversationViewModel {
  constructor(private readonly conversation: Conversation) {}

  public toResource(): ConversationResource {
    const primitives = this.conversation.toPrimitives();

    return {
      id: primitives.id,
      name: primitives.name,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      type: primitives.type as 'group' | 'one-to-one',
    };
  }
}
