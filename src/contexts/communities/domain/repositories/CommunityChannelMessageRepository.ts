import { CommunityChannelMessage } from '../CommunityChannelMessage';
import { CommunityChannelId } from '../value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../value-objects/CommunityChannelMessageId';
import { CommunityId } from '../value-objects/CommunityId';

export interface CommunityChannelMessageRepository {
  findById(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    messageId: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage | undefined>;
  findByChannel(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    limit: number,
    beforeMessageId?: CommunityChannelMessageId,
  ): Promise<CommunityChannelMessage[]>;
  save(message: CommunityChannelMessage): Promise<void>;
}
