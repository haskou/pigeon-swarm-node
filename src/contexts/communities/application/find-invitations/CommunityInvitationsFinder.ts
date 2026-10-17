import { Community } from '../../domain/Community';
import { CommunityInvitation } from '../../domain/entities/invitations/CommunityInvitation';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityInvitationsFindMessage } from './messages/CommunityInvitationsFindMessage';

/**
 * The invitations of a community, for its members. They already read every
 * invitation in the operations, so this reveals nothing new to them.
 */
export default class CommunityInvitationsFinder {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
  ) {}

  public async find(message: CommunityInvitationsFindMessage): Promise<{
    community: Community;
    invitations: CommunityInvitation[];
  }> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewAsMember(message.identityId);

    return {
      community,
      invitations: (
        await this.communityRepository.findInvitations(message.communityId)
      ).list(),
    };
  }
}
