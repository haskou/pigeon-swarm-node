import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from './value-objects/ConversationId';
import { MessageId } from './value-objects/MessageId';

export class MessageMetadata {
  constructor(
    private readonly id: MessageId,
    private readonly conversationId: ConversationId,
    private readonly authorId: IdentityId,
    private readonly previousMessageIds: MessageId[],
    private readonly createdAt: Timestamp,
    private readonly signature: Signature,
    private readonly replyToMessageId?: MessageId,
  ) {}

  public getId(): MessageId {
    return this.id;
  }

  public getConversationId(): ConversationId {
    return this.conversationId;
  }

  public getAuthorId(): IdentityId {
    return this.authorId;
  }

  public getPreviousMessageIds(): MessageId[] {
    return [...this.previousMessageIds];
  }

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }

  public getSignature(): Signature {
    return this.signature;
  }

  public getReplyToMessageId(): MessageId | undefined {
    return this.replyToMessageId;
  }
}
