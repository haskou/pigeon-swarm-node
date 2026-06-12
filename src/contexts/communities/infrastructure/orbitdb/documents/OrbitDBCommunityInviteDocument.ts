export interface OrbitDBCommunityInviteDocument extends Record<
  string,
  unknown
> {
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  deleted?: boolean;
  deletedAt?: number;
  encryptedCommunityKey?: {
    algorithm: string;
    ciphertext: string;
    nonce: string;
    version: number;
  };
  expiresAt?: number;
  id: string;
  kind: 'community_invite';
  maxUses: number;
  token: string;
  uses: number;
}
