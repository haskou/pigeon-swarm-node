import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelDraft } from '../CommunityChannelDraft';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityChannelMessageEncryptedPayload } from '../value-objects/CommunityChannelMessageEncryptedPayload';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class CommunityChannelDraftRepository {
  public abstract delete(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<void>;

  public abstract findByIdentity(
    identityId: IdentityId,
  ): Promise<CommunityChannelDraft[]>;

  public abstract save(
    identityId: IdentityId,
    communityId: CommunityId,
    channelId: CommunityChannelId,
    encryptedPayload: CommunityChannelMessageEncryptedPayload,
    updatedAt: Timestamp,
  ): Promise<void>;
}
