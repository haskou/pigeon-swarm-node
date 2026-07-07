import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../value-objects/EncryptedMessagePayload';
import { MessageId } from '../../value-objects/MessageId';
import { Message, MessageType } from './Message';
import { MessageMetadata } from './MessageMetadata';
import { MessageSignaturePayload } from './MessageSignaturePayload';

export class MessageSent extends Message {
  public static create(
    metadata: MessageMetadata,
    encryptedPayload: EncryptedMessagePayload,
  ): MessageSent {
    return new MessageSent(metadata, encryptedPayload);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<MessageSent>,
  ): MessageSent {
    return new MessageSent(
      new MessageMetadata(
        new MessageId(primitives.id),
        new ConversationId(primitives.conversationId),
        new IdentityId(primitives.authorId),
        primitives.previousMessageIds.map(
          (messageId) => new MessageId(messageId),
        ),
        new Timestamp(primitives.createdAt),
        new Signature(primitives.signature),
        primitives.replyToMessageId
          ? new MessageId(primitives.replyToMessageId)
          : undefined,
      ),
      new EncryptedMessagePayload(primitives.encryptedPayload),
    );
  }

  constructor(
    metadata: MessageMetadata,
    private readonly encryptedPayload: EncryptedMessagePayload,
  ) {
    super(metadata);
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

  public toSignaturePayload(): MessageSignaturePayload {
    return this.buildSignaturePayload(this.encryptedPayload);
  }
}
