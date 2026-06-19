import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { Message } from '@app/contexts/conversations/domain/entities/messages/Message';
import { GroupConversation } from '@app/contexts/conversations/domain/GroupConversation';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { Timestamp } from '@haskou/value-objects';

import { OrbitDBConversationDocument } from '../documents/OrbitDBConversationDocument';

export default class OrbitDBConversationMapper {
  public toDocument(
    conversation: Conversation,
    createdAt: Timestamp = Timestamp.now(),
  ): OrbitDBConversationDocument {
    const primitives = conversation.toPrimitives();

    return {
      createdAt: createdAt.valueOf(),
      id: primitives.id,
      name: primitives.name,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      type: primitives.type as 'group' | 'one-to-one',
      updatedAt: Date.now(),
    };
  }

  public toDomain(
    document: OrbitDBConversationDocument,
    messages: Message[] = [],
  ): Conversation {
    const primitives = {
      id: document.id,
      messages: messages.map((message) => message.toPrimitives()),
      name: document.name,
      networkId: document.networkId,
      participantIds: document.participantIds,
      type: document.type,
    };

    if (document.type === 'group') {
      return GroupConversation.fromPrimitives(primitives);
    }

    return OneToOneConversation.fromPrimitives(primitives);
  }
}
