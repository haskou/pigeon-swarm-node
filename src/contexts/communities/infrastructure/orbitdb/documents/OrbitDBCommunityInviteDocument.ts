export type OrbitDBCommunityInviteDocument = {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  expiresAt?: number;
  id: string;
  maxUses: number;
  nonce: string;
  proof: Record<string, unknown>;
  scopeType: 'community_invite';
  token: string;
};
