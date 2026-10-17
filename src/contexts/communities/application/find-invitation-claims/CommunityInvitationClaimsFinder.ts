import { Community } from '../../domain/Community';
import { CommunityInvitationClaim } from '../../domain/entities/invitations/CommunityInvitationClaim';
import { CommunityInvitations } from '../../domain/entities/invitations/CommunityInvitations';
import CommunityInvitationClaimRepository from '../../domain/repositories/CommunityInvitationClaimRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityInvitationClaimsFindMessage } from './messages/CommunityInvitationClaimsFindMessage';

/**
 * The claims a `manage_members` holder may still admit: under an invitation
 * that is live and open now, by an identity that is neither a member nor
 * banned and has not joined under it. The admitter checks each claim again
 * at its own frontier before it signs an admission.
 */
export default class CommunityInvitationClaimsFinder {
  private static isPending(
    community: Community,
    invitations: CommunityInvitations,
    claim: CommunityInvitationClaim,
    now: number,
  ): boolean {
    const joiner = claim.getIdentityId();
    const invitation = invitations.find(claim.getInvitationId());

    return (
      invitation !== undefined &&
      invitation.isLiveIn(community) &&
      invitation.isOpenAt(now) &&
      !invitation.hasJoined(joiner) &&
      !community.isBanned(joiner) &&
      !community.isMember(joiner)
    );
  }

  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly claimRepository: CommunityInvitationClaimRepository,
  ) {}

  public async find(
    message: CommunityInvitationClaimsFindMessage,
  ): Promise<CommunityInvitationClaim[]> {
    const community = await this.communityFinder.findById(message.communityId);

    community.viewInvitationClaims(message.identityId);

    const invitations = await this.communityRepository.findInvitations(
      message.communityId,
    );
    const now = Date.now();

    return (
      await this.claimRepository.findByCommunity(message.communityId)
    ).filter((claim) =>
      CommunityInvitationClaimsFinder.isPending(
        community,
        invitations,
        claim,
        now,
      ),
    );
  }
}
