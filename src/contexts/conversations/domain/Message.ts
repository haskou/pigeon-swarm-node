import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { AttachmentExternalIdentifier } from './value-objects/AttachmentExternalIdentifier';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageId } from './value-objects/MessageId';
import { MessageType } from './value-objects/MessageType';

type AttachmentExternalIdentifiers = AttachmentExternalIdentifier[];

export abstract class Message {
  private readonly attachmentExternalIdentifiers: AttachmentExternalIdentifiers;

  protected constructor(
    private readonly id: MessageId,
    private readonly conversationId: ConversationId,
    private readonly authorId: IdentityId,
    private readonly previousMessageIds: MessageId[],
    private readonly createdAt: Timestamp,
    private readonly signature: Signature,
    attachmentExternalIdentifiers: AttachmentExternalIdentifiers = [],
  ) {
    this.attachmentExternalIdentifiers = attachmentExternalIdentifiers;
  }

  private basePrimitives() {
    return {
      attachmentExternalIdentifiers: this.attachmentExternalIdentifiers.map(
        (externalIdentifier) => externalIdentifier.valueOf(),
      ),
      authorId: this.authorId.valueOf(),
      conversationId: this.conversationId.valueOf(),
      createdAt: this.createdAt.valueOf(),
      id: this.id.valueOf(),
      previousMessageIds: this.previousMessageIds.map((messageId) =>
        messageId.valueOf(),
      ),
      signature: this.signature.valueOf(),
    };
  }

  public getId(): MessageId {
    return this.id;
  }

  public getAuthorId(): IdentityId {
    return this.authorId;
  }

  public abstract getType(): MessageType;

  public getTargetMessageId(): MessageId | undefined {
    return undefined;
  }

  public getEncryptedPayload(): EncryptedMessagePayload | undefined {
    return undefined;
  }

  public toPrimitives() {
    return {
      ...this.basePrimitives(),
      encryptedPayload: this.getEncryptedPayload()?.valueOf(),
      targetMessageId: this.getTargetMessageId()?.valueOf(),
      type: this.getType().valueOf(),
    };
  }
}

export { MessageType };
