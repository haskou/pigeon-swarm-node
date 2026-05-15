import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';
import { createHash } from 'node:crypto';

import { MongoMessageReactionDocument } from '../documents/MongoMessageReactionDocument';

export default class MongoMessageReactionMapper {
  private documentId(reaction: MessageReaction): string {
    const primitives = reaction.toPrimitives();

    return createHash('sha256')
      .update(
        JSON.stringify({
          authorId: primitives.authorId,
          conversationId: primitives.conversationId,
          emoji: primitives.emoji,
          messageId: primitives.messageId,
        }),
      )
      .digest('hex');
  }

  public toDocument(reaction: MessageReaction): MongoMessageReactionDocument {
    const primitives = reaction.toPrimitives();

    return {
      _id: this.documentId(reaction),
      authorId: primitives.authorId,
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      emoji: primitives.emoji,
      messageId: primitives.messageId,
    };
  }

  public toDomain(document: MongoMessageReactionDocument): MessageReaction {
    return MessageReaction.fromPrimitives({
      authorId: document.authorId,
      conversationId: document.conversationId,
      createdAt: document.createdAt,
      emoji: document.emoji,
      messageId: document.messageId,
    });
  }
}
