import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageType } from './Message';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageId } from './value-objects/MessageId';

export class MessageEdited extends Message {
  public static create(
    conversationId: ConversationId,
    authorId: IdentityId,
    targetMessageId: MessageId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
    previousMessageIds: MessageId[] = [],
    createdAt: Timestamp = Timestamp.now(),
    id: MessageId = MessageId.generate(),
  ): MessageEdited {
    return new MessageEdited(
      id,
      conversationId,
      authorId,
      targetMessageId,
      encryptedPayload,
      previousMessageIds,
      createdAt,
      signature,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<MessageEdited>,
  ): MessageEdited {
    return new MessageEdited(
      new MessageId(primitives.id),
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.authorId),
      new MessageId(primitives.targetMessageId as string),
      new EncryptedMessagePayload(primitives.encryptedPayload as string),
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
    private readonly encryptedPayload: EncryptedMessagePayload,
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
    return MessageType.EDITED;
  }

  public getTargetMessageId(): MessageId {
    return this.targetMessageId;
  }

  public toPrimitives() {
    return {
      ...super.toPrimitives(),
      encryptedPayload: this.encryptedPayload.valueOf(),
    };
  }
}
