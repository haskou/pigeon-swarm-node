import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { Cid } from './value-objects/Cid';
import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';
import { MessageEventId } from './value-objects/MessageEventId';
import { MessageEventType } from './value-objects/MessageEventType';

export abstract class Message {
  protected constructor(
    private readonly id: MessageEventId,
    private readonly conversationId: ConversationId,
    private readonly authorId: IdentityId,
    private readonly previousEventIds: MessageEventId[],
    private readonly createdAt: Timestamp,
    private readonly signature: Signature,
    private readonly attachmentCids: Cid[] = [],
  ) {}

  private basePrimitives() {
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

  public toPrimitives() {
    return {
      ...this.basePrimitives(),
      encryptedPayload: this.getEncryptedPayload()?.valueOf(),
      targetEventId: this.getTargetEventId()?.valueOf(),
      type: this.getType().valueOf(),
    };
  }
}

export { MessageEventType };
