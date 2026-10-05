export type OrbitDBCommunityMembershipRequestDocument = {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  id: string;
  identityId: string;
  proof: Record<string, unknown>;
  scopeType: 'community_membership_request';
  status: string;
  type: string;
  updatedAt: number;
};
