import { CommunityInvitationClaimResource } from './CommunityInvitationClaimResource';

export interface CommunityInvitationClaimsResource {
  claims: CommunityInvitationClaimResource[];
  nextCursor: string | null;
}
