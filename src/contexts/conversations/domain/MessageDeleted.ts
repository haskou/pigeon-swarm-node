import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageType } from './Message';
import { ConversationId } from './value-objects/ConversationId';
import { MessageId } from './value-objects/MessageId';

export class MessageDeleted extends Message {
  public static create(
    conversationId: ConversationId,
    authorId: IdentityId,
    targetMessageId: MessageId,
    signature: Signature,
    previousMessageIds: MessageId[] = [],
    createdAt: Timestamp = Timestamp.now(),
    id: MessageId = MessageId.generate(),
  ): MessageDeleted {
    return new MessageDeleted(
      id,
      conversationId,
      authorId,
      targetMessageId,
      previousMessageIds,
      createdAt,
      signature,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<Message>,
  ): MessageDeleted {
    return new MessageDeleted(
      new MessageId(primitives.id),
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.authorId),
      new MessageId(primitives.targetMessageId as string),
      primitives.previousMessageIds.map(
        (messageId) => new MessageId(messageId),
      ),
      new Timestamp(primitives.createdAt),
      new Signature(primitives.signature),
    );
  }

  constructor(
    id: MessageId,
    conversationId: ConversationId,
    authorId: IdentityId,
    private readonly targetMessageId: MessageId,
    previousMessageIds: MessageId[],
    createdAt: Timestamp,
    signature: Signature,
  ) {
    super(
      id,
      conversationId,
      authorId,
      previousMessageIds,
      createdAt,
      signature,
    );
  }

  public getType(): MessageType {
    return MessageType.DELETED;
  }

  public getTargetMessageId(): MessageId {
    return this.targetMessageId;
  }
}
