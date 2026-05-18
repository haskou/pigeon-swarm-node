import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageType } from './Message';
import { MessageMetadata } from './MessageMetadata';
import { ConversationId } from './value-objects/ConversationId';
import { MessageId } from './value-objects/MessageId';

export type MessageDeletedCreateData = {
  authorId: IdentityId;
  conversationId: ConversationId;
  createdAt?: Timestamp;
  id?: MessageId;
  previousMessageIds?: MessageId[];
  signature: Signature;
  targetMessageId: MessageId;
};

export class MessageDeleted extends Message {
  public static create(data: MessageDeletedCreateData): MessageDeleted {
    return new MessageDeleted(
      new MessageMetadata(
        data.id ?? MessageId.generate(),
        data.conversationId,
        data.authorId,
        data.previousMessageIds ?? [],
        data.createdAt ?? Timestamp.now(),
        data.signature,
      ),
      data.targetMessageId,
    );
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
      new MessageId(primitives.targetMessageId),
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
