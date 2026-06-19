import { AttachmentExternalIdentifier } from '../../value-objects/AttachmentExternalIdentifier';
import { EncryptedMessagePayload } from '../../value-objects/EncryptedMessagePayload';
import { MessageId } from '../../value-objects/MessageId';
import { MessageType } from '../../value-objects/MessageType';
import { MessageMetadata } from './MessageMetadata';

export class MessageSignaturePayload {
  constructor(
    private readonly metadata: MessageMetadata,
    private readonly type: MessageType,
    private readonly attachments: AttachmentExternalIdentifier[] = [],
    private readonly encryptedPayload?: EncryptedMessagePayload,
    private readonly targetMessageId?: MessageId,
  ) {}

  public getMetadata(): MessageMetadata {
    return this.metadata;
  }

  public getType(): MessageType {
    return this.type;
  }

  public getAttachments(): AttachmentExternalIdentifier[] {
    return [...this.attachments];
  }

  public getEncryptedPayload(): EncryptedMessagePayload | undefined {
    return this.encryptedPayload;
  }

  public getTargetMessageId(): MessageId | undefined {
    return this.targetMessageId;
  }
}
