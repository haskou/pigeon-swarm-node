import { Community } from '../../domain/Community';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityInviteRepository from '../../domain/repositories/CommunityInviteRepository';
import CommunityMembershipRequestRepository from '../../domain/repositories/CommunityMembershipRequestRepository';
import CommunityMessageReactionRepository from '../../domain/repositories/CommunityMessageReactionRepository';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';

export default class EmptyCommunityDeleter {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly inviteRepository: CommunityInviteRepository,
    // eslint-disable-next-line max-len
    private readonly membershipRequestRepository: CommunityMembershipRequestRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
    private readonly moderationLogRepository: CommunityModerationLogRepository,
  ) {}

  public async delete(community: Community): Promise<void> {
    await this.reactionRepository.deleteByCommunity(community.getId());
    await this.messageRepository.deleteByCommunity(community.getId());
    await this.inviteRepository.deleteByCommunity(community.getId());
    await this.membershipRequestRepository.deleteByCommunity(community.getId());
    await this.moderationLogRepository.deleteByCommunity(community.getId());
    await this.communityRepository.delete(community);
  }
}
