import { Timestamp } from '@haskou/value-objects';

import { ConversationDraftKey } from './value-objects/ConversationDraftKey';
import { EncryptedMessagePayload } from './value-objects/EncryptedMessagePayload';

export class ConversationDraft {
  constructor(
    private readonly draftKey: ConversationDraftKey,
    private readonly encryptedPayload: EncryptedMessagePayload,
    private readonly updatedAt: Timestamp,
  ) {}

  public getDraftKey(): ConversationDraftKey {
    return this.draftKey;
  }

  public getEncryptedPayload(): EncryptedMessagePayload {
    return this.encryptedPayload;
  }

  public getUpdatedAt(): Timestamp {
    return this.updatedAt;
  }
}
