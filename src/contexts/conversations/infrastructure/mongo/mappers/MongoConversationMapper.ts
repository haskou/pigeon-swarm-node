import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { GroupConversation } from '@app/contexts/conversations/domain/GroupConversation';
import { Message } from '@app/contexts/conversations/domain/Message';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';
import { Timestamp } from '@haskou/value-objects';

import { MongoConversationDocument } from '../documents/MongoConversationDocument';

export default class MongoConversationMapper {
  public toDocument(
    conversation: Conversation,
    createdAt: Timestamp = Timestamp.now(),
  ): MongoConversationDocument {
    const primitives = conversation.toPrimitives();

    return {
      _id: primitives.id,
      createdAt: createdAt.valueOf(),
      name: primitives.name,
      networkId: primitives.networkId,
      participantIds: primitives.participantIds,
      type: primitives.type as 'group' | 'one-to-one',
    };
  }

  public toDomain(
    document: MongoConversationDocument,
    messages: Message[] = [],
  ): Conversation {
    const primitives = {
      id: document._id,
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
