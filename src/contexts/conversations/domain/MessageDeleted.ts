import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageEventType } from './Message';
import { ConversationId } from './value-objects/ConversationId';
import { MessageEventId } from './value-objects/MessageEventId';

export class MessageDeleted extends Message {
  public static create(
    conversationId: ConversationId,
    authorId: IdentityId,
    targetEventId: MessageEventId,
    signature: Signature,
    previousEventIds: MessageEventId[] = [],
    createdAt: Timestamp = Timestamp.now(),
    id: MessageEventId = MessageEventId.generate(),
  ): MessageDeleted {
    return new MessageDeleted(
      id,
      conversationId,
      authorId,
      targetEventId,
      previousEventIds,
      createdAt,
      signature,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<Message>,
  ): MessageDeleted {
    return new MessageDeleted(
      new MessageEventId(primitives.id),
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.authorId),
      new MessageEventId(primitives.targetEventId as string),
      primitives.previousEventIds.map((eventId) => new MessageEventId(eventId)),
      new Timestamp(primitives.createdAt),
      new Signature(primitives.signature),
    );
  }

  constructor(
    id: MessageEventId,
    conversationId: ConversationId,
    authorId: IdentityId,
    private readonly targetEventId: MessageEventId,
    previousEventIds: MessageEventId[],
    createdAt: Timestamp,
    signature: Signature,
  ) {
    super(id, conversationId, authorId, previousEventIds, createdAt, signature);
  }

  public getType(): MessageEventType {
    return MessageEventType.DELETED;
  }

  public getTargetEventId(): MessageEventId {
    return this.targetEventId;
  }
}
