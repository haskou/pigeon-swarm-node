import { Community } from '../../domain/Community';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';

export default class EmptyCommunityDeleter {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly moderationLogRepository: CommunityModerationLogRepository,
  ) {}

  public async delete(community: Community): Promise<void> {
    await this.moderationLogRepository.deleteByCommunity(community.getId());
    await this.communityRepository.delete(community);
  }
}
