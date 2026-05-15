import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageReactionEmoji } from '../../../domain/value-objects/MessageReactionEmoji';

export class RegisterMessageReaction {
  public readonly authorId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly emoji: MessageReactionEmoji;
  public readonly messageId: MessageId;

  constructor(
    conversationId: string,
    messageId: string,
    authorId: string,
    emoji: string,
    createdAt: number,
  ) {
    this.authorId = new IdentityId(authorId);
    this.conversationId = new ConversationId(conversationId);
    this.createdAt = new Timestamp(createdAt);
    this.emoji = new MessageReactionEmoji(emoji);
    this.messageId = new MessageId(messageId);
  }
}
