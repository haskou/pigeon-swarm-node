import { Signature, Timestamp } from '@haskou/value-objects';

import { AttachmentExternalIdentifier } from '../../../domain/value-objects/AttachmentExternalIdentifier';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '../../../domain/value-objects/MessageId';
import { MessageSendOptions } from '../../../domain/value-objects/MessageSendOptions';

export class MessageSendPayload {
  private readonly attachments: AttachmentExternalIdentifier[];
  private readonly createdAt: Timestamp;
  private readonly encryptedPayload: EncryptedMessagePayload;
  private readonly id: MessageId;
  private readonly previousMessageIds: MessageId[];
  private readonly replyToMessageId?: MessageId;
  private readonly signature: Signature;

  constructor(
    id: string,
    encryptedPayload: string,
    signature: string,
    createdAt: number,
    attachmentExternalIdentifiers: string[] = [],
    previousMessageIds: string[] = [],
    replyToMessageId?: string,
  ) {
    this.attachments = attachmentExternalIdentifiers.map(
      (externalIdentifier) =>
        new AttachmentExternalIdentifier(externalIdentifier),
    );
    this.createdAt = new Timestamp(createdAt);
    this.encryptedPayload = new EncryptedMessagePayload(encryptedPayload);
    this.id = new MessageId(id);
    this.previousMessageIds = previousMessageIds.map(
      (messageId) => new MessageId(messageId),
    );
    this.replyToMessageId = replyToMessageId
      ? new MessageId(replyToMessageId)
      : undefined;
    this.signature = new Signature(signature);
  }

  public getEncryptedPayload(): EncryptedMessagePayload {
    return this.encryptedPayload;
  }

  public getSignature(): Signature {
    return this.signature;
  }

  public getOptions(): MessageSendOptions {
    return new MessageSendOptions(
      this.attachments,
      this.createdAt,
      this.id,
      this.previousMessageIds,
      this.replyToMessageId,
    );
  }

  public getPreviousMessageIds(): MessageId[] {
    return [...this.previousMessageIds];
  }
}
