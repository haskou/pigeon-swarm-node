import { CommunityMembershipRequestResource } from './CommunityMembershipRequestResource';

export interface CommunityMembershipRequestsResource {
  nextCursor: string | null;
  requests: CommunityMembershipRequestResource[];
}
