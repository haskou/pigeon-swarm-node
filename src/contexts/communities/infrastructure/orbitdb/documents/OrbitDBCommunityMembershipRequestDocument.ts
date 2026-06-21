export interface OrbitDBCommunityMembershipRequestDocument extends Record<
  string,
  unknown
> {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  deleted?: boolean;
  deletedAt?: number;
  id: string;
  identityId: string;
  kind: 'community_membership_request';
  status: string;
  type: string;
  updatedAt: number;
}
