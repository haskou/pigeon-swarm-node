import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { ConversationId } from '../../value-objects/ConversationId';
import { MessageId } from '../../value-objects/MessageId';
import { MessageType } from '../../value-objects/MessageType';
import { MessageMetadata } from './MessageMetadata';

export abstract class Message {
  protected constructor(private readonly metadata: MessageMetadata) {}

  protected basePrimitives(): {
    authorId: string;
    conversationId: string;
    createdAt: number;
    id: string;
    previousMessageIds: string[];
    replyToMessageId?: string;
  } {
    return {
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
    const targetMessageId = this.getTargetMessageId();

    return {
      ...this.basePrimitives(),
      ...(targetMessageId
        ? { targetMessageId: targetMessageId.valueOf() }
        : {}),
      type: this.getType().valueOf(),
    };
  }
}

export { MessageType };
