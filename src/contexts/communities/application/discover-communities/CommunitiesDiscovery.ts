import { Community } from '../../domain/Community';
import { CommunityMembershipRequest } from '../../domain/entities/membership/CommunityMembershipRequest';
import { PageSlice } from '../pagination/PageSlice';

export class CommunitiesDiscovery {
  constructor(
    private readonly communities: PageSlice<Community>,
    private readonly membershipRequests: CommunityMembershipRequest[],
  ) {}

  public getCommunities(): Community[] {
    return [...this.communities.items];
  }

  /** The community id to read after next: set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.communities.nextPosition;
  }

  public getMembershipRequests(): CommunityMembershipRequest[] {
    return [...this.membershipRequests];
  }
}
