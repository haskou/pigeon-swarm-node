import { Community } from '../../domain/Community';
import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';

export class CommunitiesDiscovery {
  constructor(
    private readonly communities: Community[],
    private readonly membershipRequests: CommunityMembershipRequest[],
  ) {}

  public getCommunities(): Community[] {
    return [...this.communities];
  }

  public getMembershipRequests(): CommunityMembershipRequest[] {
    return [...this.membershipRequests];
  }
}
