import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';

import { CommunityInvitationClaim } from '../entities/invitations/CommunityInvitationClaim';
import { CommunityId } from '../value-objects/CommunityId';

export default abstract class CommunityInvitationClaimRepository {
  public abstract findByCommunity(
    communityId: CommunityId,
  ): Promise<CommunityInvitationClaim[]>;

  public abstract save(
    claim: CommunityInvitationClaim,
    proof: PublicMutationProof,
  ): Promise<void>;
}
