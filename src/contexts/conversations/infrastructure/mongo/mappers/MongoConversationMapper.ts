import { Conversation } from '@app/contexts/conversations/domain/Conversation';
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
      participantIds: primitives.participantIds,
      type: 'one-to-one',
    };
  }

  public toDomain(document: MongoConversationDocument): OneToOneConversation {
    return OneToOneConversation.fromPrimitives({
      id: document._id,
      messages: [],
      participantIds: document.participantIds,
    });
  }
}
