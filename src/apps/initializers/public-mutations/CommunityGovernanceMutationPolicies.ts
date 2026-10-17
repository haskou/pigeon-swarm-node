import CommunityInvitationClaimMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityInvitationClaimMutationPolicy';
import CommunityMembershipRequestMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityMembershipRequestMutationPolicy';
import CommunityModerationLogMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityModerationLogMutationPolicy';
import CommunityOperationMutationPolicy from '@app/contexts/communities/infrastructure/orbitdb/policies/CommunityOperationMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class CommunityGovernanceMutationPolicies {
  constructor(
    private readonly invitationClaims: CommunityInvitationClaimMutationPolicy,
    private readonly membershipRequests: CommunityMembershipRequestMutationPolicy,
    private readonly moderationLogs: CommunityModerationLogMutationPolicy,
    private readonly operations: CommunityOperationMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [
      this.invitationClaims,
      this.membershipRequests,
      this.moderationLogs,
      this.operations,
    ];
  }
}
