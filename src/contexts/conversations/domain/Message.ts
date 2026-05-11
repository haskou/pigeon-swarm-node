import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

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
    private readonly id: MessageId,
    private readonly conversationId: ConversationId,
    private readonly authorId: IdentityId,
    private readonly previousMessageIds: MessageId[],
    private readonly createdAt: Timestamp,
    private readonly signature: Signature,
    private readonly replyToMessageId?: MessageId,
    attachmentExternalIdentifiers: AttachmentExternalIdentifiers = [],
  ) {
    this.attachmentExternalIdentifiers = attachmentExternalIdentifiers;
  }

  protected basePrimitives(): MessageBasePrimitives {
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
      replyToMessageId: this.replyToMessageId?.valueOf(),
      signature: this.signature.valueOf(),
    };
  }

  public getId(): MessageId {
    return this.id;
  }

  public getConversationId(): ConversationId {
    return this.conversationId;
  }

  public getAuthorId(): IdentityId {
    return this.authorId;
  }

  public abstract getType(): MessageType;

  public getTargetMessageId(): MessageId | undefined {
    return undefined;
  }

  public getReplyToMessageId(): MessageId | undefined {
    return this.replyToMessageId;
  }

  public toPrimitives() {
    return {
      ...this.basePrimitives(),
      targetMessageId: this.getTargetMessageId()?.valueOf(),
      type: this.getType().valueOf(),
    };
  }
}

export { MessageType };
