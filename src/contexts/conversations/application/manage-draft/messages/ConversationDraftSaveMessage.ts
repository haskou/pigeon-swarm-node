import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../../../domain/value-objects/ConversationId';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';

export class ConversationDraftSaveMessage {
  public readonly conversationId: ConversationId;
  public readonly encryptedPayload: EncryptedMessagePayload;
  public readonly identityId: IdentityId;
  public readonly updatedAt: Timestamp;

  constructor(
    identityId: string,
    conversationId: string,
    encryptedPayload: string,
    updatedAt?: number,
  ) {
    this.identityId = new IdentityId(identityId);
    this.conversationId = new ConversationId(conversationId);
    this.encryptedPayload = new EncryptedMessagePayload(encryptedPayload);
    this.updatedAt = updatedAt ? new Timestamp(updatedAt) : Timestamp.now();
  }
}
