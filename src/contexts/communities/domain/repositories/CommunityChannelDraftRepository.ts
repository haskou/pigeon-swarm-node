import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityId } from '../value-objects/CommunityId';
import { CommunityChannelDraft } from './types/CommunityChannelDraft';

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
    encryptedPayload: string,
    updatedAt: Timestamp,
  ): Promise<void>;
}
