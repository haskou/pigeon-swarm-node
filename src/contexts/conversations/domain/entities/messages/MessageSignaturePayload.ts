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

  public toPrimitives(): {
    attachmentExternalIdentifiers: string[];
    authorId: string;
    conversationId: string;
    createdAt: number;
    encryptedPayload?: string;
    id: string;
    previousMessageIds: string[];
    replyToMessageId?: string;
    targetMessageId?: string;
    type: string;
  } {
    return {
      attachmentExternalIdentifiers: this.attachments.map((attachment) =>
        attachment.valueOf(),
      ),
      authorId: this.metadata.getAuthorId().valueOf(),
      conversationId: this.metadata.getConversationId().valueOf(),
      createdAt: this.metadata.getCreatedAt().valueOf(),
      encryptedPayload: this.encryptedPayload?.valueOf(),
      id: this.metadata.getId().valueOf(),
      previousMessageIds: this.metadata
        .getPreviousMessageIds()
        .map((messageId) => messageId.valueOf()),
      replyToMessageId: this.metadata.getReplyToMessageId()?.valueOf(),
      targetMessageId: this.targetMessageId?.valueOf(),
      type: this.type.valueOf(),
    };
  }
}
