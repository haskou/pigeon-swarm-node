import { Conversation } from '@app/contexts/conversations/domain/Conversation';
import { OneToOneConversation } from '@app/contexts/conversations/domain/OneToOneConversation';

import { MongoConversationDocument } from '../documents/MongoConversationDocument';

export default class MongoConversationMapper {
  public toDocument(conversation: Conversation): MongoConversationDocument {
    const primitives = conversation.toPrimitives();
    const timestamp = Date.now();

    return {
      _id: primitives.id,
      createdAt: timestamp,
      participantIds: primitives.participantIds,
      type: 'one-to-one',
      updatedAt: timestamp,
    };
  }

  public toDomain(document: MongoConversationDocument): Conversation {
    return OneToOneConversation.fromPrimitives({
      id: document._id,
      messages: [],
      participantIds: document.participantIds,
    });
  }
}
