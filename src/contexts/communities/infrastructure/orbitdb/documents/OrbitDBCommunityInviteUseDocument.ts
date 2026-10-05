export type OrbitDBCommunityInviteUseDocument = {
  communityId: string;
  id: string;
  identityId: string;
  proof: Record<string, unknown>;
  scopeType: 'community_invite_use';
  token: string;
  usedAt: number;
};
