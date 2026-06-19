import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../value-objects/ConversationId';
import { MessageId } from '../../value-objects/MessageId';
import { MessageReactionEmoji } from '../../value-objects/MessageReactionEmoji';

export class MessageReaction {
  public static create(
    conversationId: ConversationId,
    messageId: MessageId,
    authorId: IdentityId,
    emoji: MessageReactionEmoji,
    createdAt: Timestamp = Timestamp.now(),
  ): MessageReaction {
    return new MessageReaction(
      conversationId,
      messageId,
      authorId,
      emoji,
      createdAt,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<MessageReaction>,
  ): MessageReaction {
    return new MessageReaction(
      new ConversationId(primitives.conversationId),
      new MessageId(primitives.messageId),
      new IdentityId(primitives.authorId),
      new MessageReactionEmoji(primitives.emoji),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly conversationId: ConversationId,
    private readonly messageId: MessageId,
    private readonly authorId: IdentityId,
    private readonly emoji: MessageReactionEmoji,
    private readonly createdAt: Timestamp,
  ) {}

  public getConversationId(): ConversationId {
    return this.conversationId;
  }

  public getMessageId(): MessageId {
    return this.messageId;
  }

  public getAuthorId(): IdentityId {
    return this.authorId;
  }

  public getEmoji(): MessageReactionEmoji {
    return this.emoji;
  }

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }

  public toPrimitives() {
    return {
      authorId: this.authorId.valueOf(),
      conversationId: this.conversationId.valueOf(),
      createdAt: this.createdAt.valueOf(),
      emoji: this.emoji.valueOf(),
      messageId: this.messageId.valueOf(),
    };
  }
}
