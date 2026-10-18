import { CommunityInvitationClaim } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitationClaim';

import { CommunityInvitationClaimsResource } from '../resources/CommunityInvitationClaimsResource';

export class CommunityInvitationClaimsViewModel {
  constructor(
    private readonly claims: CommunityInvitationClaim[],
    private readonly nextCursor: string | null,
  ) {}

  public toResource(): CommunityInvitationClaimsResource {
    return {
      claims: this.claims.map((claim) => claim.toPrimitives()),
      nextCursor: this.nextCursor,
    };
  }
}
