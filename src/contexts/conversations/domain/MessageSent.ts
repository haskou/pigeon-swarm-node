import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { Message, MessageType } from './Message';
import { AttachmentExternalIdentifier } from './value-objects/AttachmentExternalIdentifier';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageId } from './value-objects/MessageId';

export class MessageSent extends Message {
  public static create(
    conversationId: ConversationId,
    authorId: IdentityId,
    encryptedPayload: EncryptedMessagePayload,
    signature: Signature,
    previousMessageIds: MessageId[] = [],
    attachmentExternalIdentifiers: AttachmentExternalIdentifier[] = [],
    createdAt: Timestamp = Timestamp.now(),
    id: MessageId = MessageId.generate(),
    replyToMessageId?: MessageId,
  ): MessageSent {
    return new MessageSent(
      id,
      conversationId,
      authorId,
      encryptedPayload,
      previousMessageIds,
      createdAt,
      signature,
      attachmentExternalIdentifiers,
      replyToMessageId,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<MessageSent>,
  ): MessageSent {
    return new MessageSent(
      new MessageId(primitives.id),
      new ConversationId(primitives.conversationId),
      new IdentityId(primitives.authorId),
      new EncryptedMessagePayload(primitives.encryptedPayload as string),
      primitives.previousMessageIds.map(
        (messageId) => new MessageId(messageId),
      ),
      new Timestamp(primitives.createdAt),
      new Signature(primitives.signature),
      primitives.attachmentExternalIdentifiers.map(
        (externalIdentifier) =>
          new AttachmentExternalIdentifier(externalIdentifier),
      ),
      primitives.replyToMessageId
        ? new MessageId(primitives.replyToMessageId)
        : undefined,
    );
  }

  constructor(
    id: MessageId,
    conversationId: ConversationId,
    authorId: IdentityId,
    private readonly encryptedPayload: EncryptedMessagePayload,
    previousMessageIds: MessageId[],
    createdAt: Timestamp,
    signature: Signature,
    attachmentExternalIdentifiers: AttachmentExternalIdentifier[] = [],
    replyToMessageId?: MessageId,
  ) {
    super(
      id,
      conversationId,
      authorId,
      previousMessageIds,
      createdAt,
      signature,
      replyToMessageId,
      attachmentExternalIdentifiers,
    );
  }

  public getType(): MessageType {
    return MessageType.SENT;
  }

  public toPrimitives() {
    return {
      ...super.toPrimitives(),
      encryptedPayload: this.encryptedPayload.valueOf(),
    };
  }
}
