import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageReactionEmoji } from '../../../domain/value-objects/MessageReactionEmoji';

export class MessageReactionRemoveMessage {
  public readonly authorId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly emoji: MessageReactionEmoji;
  public readonly createdAt: Timestamp;
  public readonly messageId: MessageId;
  public readonly proof: PublicMutationProof;

  constructor(
    conversationId: string,
    messageId: string,
    authorId: string,
    emoji: string,
    proof: unknown,
    createdAt?: number,
  ) {
    this.authorId = new IdentityId(authorId);
    this.conversationId = new ConversationId(conversationId);
    this.emoji = new MessageReactionEmoji(emoji);
    this.messageId = new MessageId(messageId);
    this.createdAt =
      createdAt === undefined ? Timestamp.now() : new Timestamp(createdAt);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
