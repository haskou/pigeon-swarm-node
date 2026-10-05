export type OrbitDBCommunityInviteDocument = {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  encryptedCommunityKey?: {
    algorithm: string;
    ciphertext: string;
    nonce: string;
    version: number;
  };
  expiresAt?: number;
  id: string;
  maxUses: number;
  nonce: string;
  proof: Record<string, unknown>;
  scopeType: 'community_invite';
  token: string;
};
