import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/value-objects';

import { MessageMetadata } from './MessageMetadata';
import { MessageSignaturePayload } from './types/MessageSignaturePayload';
import { AttachmentExternalIdentifier } from './value-objects/AttachmentExternalIdentifier';
import { ConversationId } from './value-objects/ConversationId';
import { MessageId } from './value-objects/MessageId';
import { MessageType } from './value-objects/MessageType';

type AttachmentExternalIdentifiers = AttachmentExternalIdentifier[];
type MessageBasePrimitives = {
  attachmentExternalIdentifiers: string[];
  authorId: string;
  conversationId: string;
  createdAt: number;
  id: string;
  previousMessageIds: string[];
  replyToMessageId?: string;
  signature: string;
};

export abstract class Message {
  private readonly attachmentExternalIdentifiers: AttachmentExternalIdentifiers;

  protected constructor(
    private readonly metadata: MessageMetadata,
    attachmentExternalIdentifiers: AttachmentExternalIdentifiers = [],
  ) {
    this.attachmentExternalIdentifiers = attachmentExternalIdentifiers;
  }

  protected basePrimitives(): MessageBasePrimitives {
    return {
      attachmentExternalIdentifiers: this.attachmentExternalIdentifiers.map(
        (externalIdentifier) => externalIdentifier.valueOf(),
      ),
      authorId: this.metadata.getAuthorId().valueOf(),
      conversationId: this.metadata.getConversationId().valueOf(),
      createdAt: this.metadata.getCreatedAt().valueOf(),
      id: this.metadata.getId().valueOf(),
      previousMessageIds: this.metadata
        .getPreviousMessageIds()
        .map((messageId) => messageId.valueOf()),
      replyToMessageId: this.metadata.getReplyToMessageId()?.valueOf(),
      signature: this.metadata.getSignature().valueOf(),
    };
  }

  protected baseSignaturePayload(): Omit<
    MessageSignaturePayload,
    'encryptedPayload' | 'targetMessageId' | 'type'
  > {
    return {
      attachmentExternalIdentifiers: this.attachmentExternalIdentifiers.map(
        (externalIdentifier) => externalIdentifier.valueOf(),
      ),
      authorId: this.metadata.getAuthorId().valueOf(),
      conversationId: this.metadata.getConversationId().valueOf(),
      createdAt: this.metadata.getCreatedAt().valueOf(),
      id: this.metadata.getId().valueOf(),
      previousMessageIds: this.metadata
        .getPreviousMessageIds()
        .map((messageId) => messageId.valueOf()),
      replyToMessageId: this.metadata.getReplyToMessageId()?.valueOf(),
    };
  }

  public getId(): MessageId {
    return this.metadata.getId();
  }

  public getConversationId(): ConversationId {
    return this.metadata.getConversationId();
  }

  public getAuthorId(): IdentityId {
    return this.metadata.getAuthorId();
  }

  public getSignature(): Signature {
    return this.metadata.getSignature();
  }

  public abstract getType(): MessageType;

  public getTargetMessageId(): MessageId | undefined {
    return undefined;
  }

  public getReplyToMessageId(): MessageId | undefined {
    return this.metadata.getReplyToMessageId();
  }

  public getPreviousMessageIds(): MessageId[] {
    return this.metadata.getPreviousMessageIds();
  }

  public toPrimitives() {
    return {
      ...this.basePrimitives(),
      targetMessageId: this.getTargetMessageId()?.valueOf(),
      type: this.getType().valueOf(),
    };
  }

  public toSignaturePayload(): MessageSignaturePayload {
    return {
      ...this.baseSignaturePayload(),
      targetMessageId: this.getTargetMessageId()?.valueOf(),
      type: this.getType().valueOf(),
    };
  }
}

export { MessageType };
