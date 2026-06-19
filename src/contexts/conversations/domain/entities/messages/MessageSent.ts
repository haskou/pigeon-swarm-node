import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { MessageSentCreateData } from '../../types/MessageSentCreateData';
import { MessageSignaturePayload } from '../../types/MessageSignaturePayload';
import { AttachmentExternalIdentifier } from '../../value-objects/AttachmentExternalIdentifier';
import { ConversationId } from '../../value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../value-objects/EncryptedMessagePayload';
import { MessageId } from '../../value-objects/MessageId';
import { Message, MessageType } from './Message';
import { MessageMetadata } from './MessageMetadata';

export { MessageSentCreateData } from '../../types/MessageSentCreateData';

export class MessageSent extends Message {
  public static create(data: MessageSentCreateData): MessageSent {
    return new MessageSent(
      new MessageMetadata(
        data.id ?? MessageId.generate(),
        data.conversationId,
        data.authorId,
        data.previousMessageIds ?? [],
        data.createdAt ?? Timestamp.now(),
        data.signature,
        data.replyToMessageId,
      ),
      data.encryptedPayload,
      data.attachmentExternalIdentifiers,
    );
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
      primitives.attachmentExternalIdentifiers.map(
        (externalIdentifier) =>
          new AttachmentExternalIdentifier(externalIdentifier),
      ),
    );
  }

  constructor(
    metadata: MessageMetadata,
    private readonly encryptedPayload: EncryptedMessagePayload,
    attachmentExternalIdentifiers: AttachmentExternalIdentifier[] = [],
  ) {
    super(metadata, attachmentExternalIdentifiers);
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
    return {
      ...super.toSignaturePayload(),
      encryptedPayload: this.encryptedPayload.valueOf(),
    };
  }
}
