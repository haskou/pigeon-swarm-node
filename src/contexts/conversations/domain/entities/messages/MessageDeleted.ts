import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../value-objects/ConversationId';
import { MessageId } from '../../value-objects/MessageId';
import { Message, MessageType } from './Message';
import { MessageMetadata } from './MessageMetadata';

export class MessageDeleted extends Message {
  private static targetMessageIdFromPrimitives(
    primitives: PrimitiveOf<Message>,
  ): MessageId {
    if (!primitives.targetMessageId) {
      throw new Error('Deleted message targetMessageId is required.');
    }

    return new MessageId(primitives.targetMessageId);
  }

  public static create(
    metadata: MessageMetadata,
    targetMessageId: MessageId,
  ): MessageDeleted {
    return new MessageDeleted(metadata, targetMessageId);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<Message>,
  ): MessageDeleted {
    return new MessageDeleted(
      new MessageMetadata(
        new MessageId(primitives.id),
        new ConversationId(primitives.conversationId),
        new IdentityId(primitives.authorId),
        primitives.previousMessageIds.map(
          (messageId) => new MessageId(messageId),
        ),
        new Timestamp(primitives.createdAt),
        new Signature(primitives.signature),
      ),
      this.targetMessageIdFromPrimitives(primitives),
    );
  }

  constructor(
    metadata: MessageMetadata,
    private readonly targetMessageId: MessageId,
  ) {
    super(metadata);
  }

  public getType(): MessageType {
    return MessageType.DELETED;
  }

  public getTargetMessageId(): MessageId {
    return this.targetMessageId;
  }
}
