export interface CommunityMembershipRequestResource {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  id: string;
  identityId: string;
  status: string;
  type: string;
  updatedAt: number;
}

export { CommunityMembershipRequestsResource } from './CommunityMembershipRequestsResource';
