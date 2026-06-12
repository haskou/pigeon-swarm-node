import { MessageReaction } from '@app/contexts/conversations/domain/MessageReaction';

import { OrbitDBMessageReactionDocument } from '../documents/OrbitDBMessageReactionDocument';

export default class OrbitDBMessageReactionMapper {
  private documentId(reaction: MessageReaction): string {
    const primitives = reaction.toPrimitives();

    return [
      'conversation',
      primitives.conversationId,
      primitives.messageId,
      primitives.authorId,
      primitives.emoji,
    ].join(':');
  }

  public toDocument(reaction: MessageReaction): OrbitDBMessageReactionDocument {
    const primitives = reaction.toPrimitives();

    return {
      authorId: primitives.authorId,
      conversationId: primitives.conversationId,
      createdAt: primitives.createdAt,
      emoji: primitives.emoji,
      id: this.documentId(reaction),
      messageId: primitives.messageId,
      scopeType: 'conversation',
    };
  }

  public toDomain(document: OrbitDBMessageReactionDocument): MessageReaction {
    return MessageReaction.fromPrimitives({
      authorId: document.authorId,
      conversationId: document.conversationId,
      createdAt: document.createdAt,
      emoji: document.emoji,
      messageId: document.messageId,
    });
  }
}
