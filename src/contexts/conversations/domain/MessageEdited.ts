import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageEventType } from './Message';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageEventId } from './value-objects/MessageEventId';

export class MessageEdited extends Message {
  public static create(
    conversationId: ConversationId,
    authorId: IdentityId,
    targetEventId: MessageEventId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
    previousEventIds: MessageEventId[] = [],
    createdAt: Timestamp = Timestamp.now(),
    id: MessageEventId = MessageEventId.generate(),
  ): MessageEdited {
    return new MessageEdited(
      id,
      conversationId,
      authorId,
      targetEventId,
      encryptedPayload,
      previousEventIds,
      createdAt,
      signature,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<Message>,
  ): MessageEdited {
    return new MessageEdited(
      new MessageEventId(primitives.id),
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.authorId),
      new MessageEventId(primitives.targetEventId as string),
      new EncryptedMessagePayload(primitives.encryptedPayload as string),
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
    private readonly encryptedPayload: EncryptedMessagePayload,
    previousEventIds: MessageEventId[],
    createdAt: Timestamp,
    signature: Signature,
  ) {
    super(id, conversationId, authorId, previousEventIds, createdAt, signature);
  }

  public getType(): MessageEventType {
    return MessageEventType.EDITED;
  }

  public getTargetEventId(): MessageEventId {
    return this.targetEventId;
  }

  public getEncryptedPayload(): EncryptedMessagePayload {
    return this.encryptedPayload;
  }
}
