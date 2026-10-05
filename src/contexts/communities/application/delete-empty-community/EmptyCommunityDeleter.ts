import { Community } from '../../domain/Community';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';

export default class EmptyCommunityDeleter {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly moderationLogRepository: CommunityModerationLogRepository,
  ) {}

  public async delete(community: Community): Promise<void> {
    await this.messageRepository.deleteByCommunity(community.getId());
    await this.moderationLogRepository.deleteByCommunity(community.getId());
    await this.communityRepository.delete(community);
  }
}
