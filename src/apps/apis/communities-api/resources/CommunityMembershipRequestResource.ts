export interface CommunityMembershipRequestResource {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  id: string;
  identityId: string;
  status: 'accepted' | 'declined' | 'pending';
  type: 'invitation' | 'request';
  updatedAt: number;
}

export interface CommunityMembershipRequestsResource {
  requests: CommunityMembershipRequestResource[];
}
