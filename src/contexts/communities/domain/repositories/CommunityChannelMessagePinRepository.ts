import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessagePin } from '../CommunityChannelMessagePin';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../value-objects/CommunityChannelMessageId';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class CommunityChannelMessagePinRepository {
  public abstract findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
  ): Promise<CommunityChannelMessagePin[]>;

  public abstract pin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    pinnedByIdentityId: IdentityId,
    createdAt: Timestamp,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract unpin(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    unpinnedByIdentityId: IdentityId,
    proof: PublicMutationProof,
  ): Promise<void>;
}
