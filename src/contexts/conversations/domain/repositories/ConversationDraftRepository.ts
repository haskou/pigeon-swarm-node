import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationDraft } from '../ConversationDraft';
import { ConversationId } from '../value-objects/ConversationId';
import { EncryptedMessagePayload } from '../value-objects/EncryptedMessagePayload';

export default abstract class ConversationDraftRepository {
  public abstract delete(
    identityId: IdentityId,
    conversationId: ConversationId,
  ): Promise<void>;

  public abstract findByIdentity(
    identityId: IdentityId,
  ): Promise<ConversationDraft[]>;

  public abstract save(
    identityId: IdentityId,
    conversationId: ConversationId,
    encryptedPayload: EncryptedMessagePayload,
    updatedAt: Timestamp,
  ): Promise<void>;
}
