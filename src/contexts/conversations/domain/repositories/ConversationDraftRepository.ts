import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationDraft } from '../ConversationDraft';
import { ConversationDraftKey } from '../value-objects/ConversationDraftKey';
import { EncryptedMessagePayload } from '../value-objects/EncryptedMessagePayload';

export default abstract class ConversationDraftRepository {
  public abstract delete(
    identityId: IdentityId,
    draftKey: ConversationDraftKey,
  ): Promise<void>;

  /** Newest `updatedAt` first. */
  public abstract findByIdentity(
    identityId: IdentityId,
  ): Promise<ConversationDraft[]>;

  public abstract save(
    identityId: IdentityId,
    draftKey: ConversationDraftKey,
    encryptedPayload: EncryptedMessagePayload,
    updatedAt: Timestamp,
  ): Promise<void>;
}
