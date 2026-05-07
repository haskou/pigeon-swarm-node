import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { Cid } from './value-objects/Cid';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageEventId } from './value-objects/MessageEventId';
import {
  MessageEventType,
  MessageEventTypeValue,
} from './value-objects/MessageEventType';

export interface MessageEventPrimitives {
  attachmentCids: string[];
  authorId: string;
  conversationId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  previousEventIds: string[];
  signature: string;
  targetEventId?: string;
  type: MessageEventTypeValue;
}

export abstract class MessageEvent {
  protected constructor(
    private readonly id: MessageEventId,
    private readonly conversationId: ConversationId,
    private readonly authorId: IdentityId,
    private readonly previousEventIds: MessageEventId[],
    private readonly createdAt: Timestamp,
    private readonly signature: Signature,
    private readonly attachmentCids: Cid[] = [],
  ) {}

  private basePrimitives(): Omit<
    MessageEventPrimitives,
    'encryptedPayload' | 'targetEventId' | 'type'
  > {
    return {
      attachmentCids: this.attachmentCids.map((cid) => cid.valueOf()),
      authorId: this.authorId.valueOf(),
      conversationId: this.conversationId.valueOf(),
      createdAt: this.createdAt.valueOf(),
      id: this.id.valueOf(),
      previousEventIds: this.previousEventIds.map((eventId) =>
        eventId.valueOf(),
      ),
      signature: this.signature.valueOf(),
    };
  }

  public getId(): MessageEventId {
    return this.id;
  }

  public getAuthorId(): IdentityId {
    return this.authorId;
  }

  public abstract getType(): MessageEventType;

  public getTargetEventId(): MessageEventId | undefined {
    return undefined;
  }

  public getEncryptedPayload(): EncryptedMessagePayload | undefined {
    return undefined;
  }

  public toPrimitives(): MessageEventPrimitives {
    return {
      ...this.basePrimitives(),
      encryptedPayload: this.getEncryptedPayload()?.valueOf(),
      targetEventId: this.getTargetEventId()?.valueOf(),
      type: this.getType().valueOf(),
    };
  }
}

export { MessageEventType };
