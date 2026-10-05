import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelThreadSummary } from '../CommunityChannelThreadSummary';
import { CommunityChannelMessage } from '../entities/messages/CommunityChannelMessage';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../value-objects/CommunityChannelMessageId';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class CommunityChannelMessageRepository {
  public abstract findById(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage | undefined>;

  public abstract findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeMessageId?: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage[]>;

  public abstract searchPublicByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    query: string,
    limit: number,
  ): Promise<CommunityChannelMessage[]>;

  public abstract searchPublicByChannels(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    query: string,
    limit: number,
  ): Promise<CommunityChannelMessage[]>;

  public abstract delete(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
    authorIdentityId: IdentityId,
    proof: PublicMutationProof,
  ): Promise<void>;

  public abstract findByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]>;

  public abstract findSyncableByCommunity(
    communityId: CommunityId,
    limit: number,
  ): Promise<CommunityChannelMessage[]>;

  public abstract findThreadMessages(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    rootMessageId: CommunityChannelMessageId,
    limit: number,
  ): Promise<CommunityChannelMessage[]>;

  public abstract findThreadSummariesByChannel(
    communityId: CommunityId,
    channelIds: CommunityChannelId[],
    limitPerChannel: number,
  ): Promise<Map<string, CommunityChannelThreadSummary[]>>;

  public abstract save(
    message: CommunityChannelMessage,
    proof: PublicMutationProof,
  ): Promise<void>;
}
