import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from './value-objects/ConversationId';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';

export class ConversationDraft {
  constructor(
    private readonly conversationId: ConversationId,
    private readonly encryptedPayload: EncryptedMessagePayload,
    private readonly updatedAt: Timestamp,
  ) {}

  public getConversationId(): ConversationId {
    return this.conversationId;
  }

  public getEncryptedPayload(): EncryptedMessagePayload {
    return this.encryptedPayload;
  }

  public getUpdatedAt(): Timestamp {
    return this.updatedAt;
  }
}
