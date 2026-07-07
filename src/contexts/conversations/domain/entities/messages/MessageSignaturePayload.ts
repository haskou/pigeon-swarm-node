import { EncryptedMessagePayload } from '../../value-objects/EncryptedMessagePayload';
import { MessageId } from '../../value-objects/MessageId';
import { MessageType } from '../../value-objects/MessageType';
import { MessageMetadata } from './MessageMetadata';

export class MessageSignaturePayload {
  constructor(
    private readonly metadata: MessageMetadata,
    private readonly type: MessageType,
    private readonly encryptedPayload?: EncryptedMessagePayload,
    private readonly targetMessageId?: MessageId,
  ) {}

  private isMessagePayload(): boolean {
    return (
      this.type.isEqual(MessageType.EDITED) ||
      this.type.isEqual(MessageType.POLL) ||
      this.type.isEqual(MessageType.SENT)
    );
  }

  public toPrimitives(): {
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

  public toSigningPrimitiveCandidates(): Array<Record<string, unknown>> {
    const canonicalPayload = this.toPrimitives();
    const emptyAttachmentExternalIdentifiers: string[] = [];

    if (!this.isMessagePayload()) {
      return [canonicalPayload];
    }

    return [
      canonicalPayload,
      {
        ...canonicalPayload,
        attachmentExternalIdentifiers: emptyAttachmentExternalIdentifiers,
      },
    ];
  }
}
