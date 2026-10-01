import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { CommunityChannelMessageReaction } from '../entities/messages/CommunityChannelMessageReaction';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../value-objects/CommunityChannelMessageId';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class CommunityMessageReactionRepository {
  public abstract delete(
    reaction: CommunityChannelMessageReaction,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessageReaction[]>;

  public abstract findByMessageIds(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageIds: CommunityChannelMessageId[],
  ): Promise<CommunityChannelMessageReaction[]>;

  public abstract findByMessageIdsInChannels(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    messageIds: CommunityChannelMessageId[],
  ): Promise<CommunityChannelMessageReaction[]>;

  public abstract save(
    reaction: CommunityChannelMessageReaction,
    proof: PublicMutationProof,
  ): Promise<void>;
}
