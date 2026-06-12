import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { ConversationId } from '../value-objects/ConversationId';
import { ConversationDraft } from './types/ConversationDraft';

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
    encryptedPayload: string,
    updatedAt: Timestamp,
  ): Promise<void>;
}
