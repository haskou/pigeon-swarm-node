import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageEventType } from './Message';
import { Cid } from './value-objects/Cid';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageEventId } from './value-objects/MessageEventId';

export class MessageSent extends Message {
  public static create(
    conversationId: ConversationId,
    authorId: IdentityId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
    previousEventIds: MessageEventId[] = [],
    attachmentCids: Cid[] = [],
    createdAt: Timestamp = Timestamp.now(),
    id: MessageEventId = MessageEventId.generate(),
  ): MessageSent {
    return new MessageSent(
      id,
      conversationId,
      authorId,
      encryptedPayload,
      previousEventIds,
      createdAt,
      signature,
      attachmentCids,
    );
  }

  public static fromPrimitives(primitives: PrimitiveOf<Message>): MessageSent {
    return new MessageSent(
      new MessageEventId(primitives.id),
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.authorId),
      new EncryptedMessagePayload(primitives.encryptedPayload as string),
      primitives.previousEventIds.map((eventId) => new MessageEventId(eventId)),
      new Timestamp(primitives.createdAt),
      new Signature(primitives.signature),
      primitives.attachmentCids.map((cid) => new Cid(cid)),
    );
  }

  constructor(
    id: MessageEventId,
    conversationId: ConversationId,
    authorId: IdentityId,
    private readonly encryptedPayload: EncryptedMessagePayload,
    previousEventIds: MessageEventId[],
    createdAt: Timestamp,
    signature: Signature,
    attachmentCids: Cid[] = [],
  ) {
    super(
      id,
      conversationId,
      authorId,
      previousEventIds,
      createdAt,
      signature,
      attachmentCids,
    );
  }

  public getType(): MessageEventType {
    return MessageEventType.SENT;
  }

  public getEncryptedPayload(): EncryptedMessagePayload {
    return this.encryptedPayload;
  }
}
