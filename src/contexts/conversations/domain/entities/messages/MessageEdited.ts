import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../value-objects/EncryptedMessagePayload';
import { MessageId } from '../../value-objects/MessageId';
import { Message, MessageType } from './Message';
import { MessageMetadata } from './MessageMetadata';
import { MessageEditedCreateData } from './types/MessageEditedCreateData';
import { MessageSignaturePayload } from './types/MessageSignaturePayload';

export { MessageEditedCreateData } from './types/MessageEditedCreateData';

export class MessageEdited extends Message {
  public static create(data: MessageEditedCreateData): MessageEdited {
    return new MessageEdited(
      new MessageMetadata(
        data.id ?? MessageId.generate(),
        data.conversationId,
        data.authorId,
        data.previousMessageIds ?? [],
        data.createdAt ?? Timestamp.now(),
        data.signature,
      ),
      data.targetMessageId,
      data.encryptedPayload,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<MessageEdited>,
  ): MessageEdited {
    return new MessageEdited(
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
      new EncryptedMessagePayload(primitives.encryptedPayload),
    );
  }

  constructor(
    metadata: MessageMetadata,
    private readonly targetMessageId: MessageId,
    private readonly encryptedPayload: EncryptedMessagePayload,
  ) {
    super(metadata);
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

  public toSignaturePayload(): MessageSignaturePayload {
    return {
      ...super.toSignaturePayload(),
      encryptedPayload: this.encryptedPayload.valueOf(),
    };
  }
}
