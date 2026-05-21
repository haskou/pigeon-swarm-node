import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';
import { MessageId } from '../../../domain/value-objects/MessageId';

export type MessageEditPayload = {
  createdAt: number;
  encryptedPayload: string;
  id: string;
  previousMessageIds?: string[];
  signature: string;
};

export class MessageEditMessage {
  public readonly authorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly encryptedPayload: EncryptedMessagePayload;
  public readonly id: MessageId;
  public readonly previousMessageIds: MessageId[];
  public readonly signature: Signature;
  public readonly targetMessageId: MessageId;

  constructor(
    conversationId: string,
    targetMessageId: string,
    authorIdentityId: string,
    payload: MessageEditPayload,
  ) {
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.conversationId = new ConversationId(conversationId);
    this.createdAt = new Timestamp(payload.createdAt);
    this.encryptedPayload = new EncryptedMessagePayload(
      payload.encryptedPayload,
    );
    this.id = new MessageId(payload.id);
    this.previousMessageIds = (
      payload.previousMessageIds ?? [targetMessageId]
    ).map((messageId) => new MessageId(messageId));
    this.signature = new Signature(payload.signature);
    this.targetMessageId = new MessageId(targetMessageId);
  }
}
