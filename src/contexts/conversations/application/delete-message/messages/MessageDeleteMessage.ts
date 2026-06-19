import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { MessageId } from '../../../domain/value-objects/MessageId';

export class MessageDeleteMessage {
  public readonly authorIdentityId: IdentityId;
  public readonly conversationId: ConversationId;
  public readonly createdAt: Timestamp;
  public readonly id: MessageId;
  public readonly signature: Signature;
  public readonly targetMessageId: MessageId;

  constructor(
    conversationId: string,
    targetMessageId: string,
    authorIdentityId: string,
    payload: {
      createdAt: number;
      id: string;
      signature: string;
    },
  ) {
    this.authorIdentityId = new IdentityId(authorIdentityId);
    this.conversationId = new ConversationId(conversationId);
    this.createdAt = new Timestamp(payload.createdAt);
    this.id = new MessageId(payload.id);
    this.signature = new Signature(payload.signature);
    this.targetMessageId = new MessageId(targetMessageId);
  }
}
