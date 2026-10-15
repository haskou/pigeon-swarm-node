import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationDraftKey } from '../../../domain/value-objects/ConversationDraftKey';
import { EncryptedMessagePayload } from '../../../domain/value-objects/EncryptedMessagePayload';

export class ConversationDraftSaveMessage {
  public readonly draftKey: ConversationDraftKey;
  public readonly encryptedPayload: EncryptedMessagePayload;
  public readonly identityId: IdentityId;
  public readonly updatedAt: Timestamp;

  constructor(
    identityId: string,
    draftKey: string,
    encryptedPayload: string,
    updatedAt?: number,
  ) {
    this.identityId = new IdentityId(identityId);
    this.draftKey = new ConversationDraftKey(draftKey);
    this.encryptedPayload = new EncryptedMessagePayload(encryptedPayload);
    this.updatedAt = updatedAt ? new Timestamp(updatedAt) : Timestamp.now();
  }
}
