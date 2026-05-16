import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageReactionEmoji } from '../../../domain/value-objects/MessageReactionEmoji';

export class MessageReactionAddMessage {
  public readonly authorId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly emoji: MessageReactionEmoji;
  public readonly messageId: MessageId;

  constructor(
    conversationId: string,
    messageId: string,
    authorId: string,
    emoji: string,
  ) {
    this.authorId = new IdentityId(authorId);
    this.conversationId = new ConversationId(conversationId);
    this.emoji = new MessageReactionEmoji(emoji);
    this.messageId = new MessageId(messageId);
  }
}
