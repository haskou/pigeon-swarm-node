export interface MongoCommunityInviteDocument {
  _id: string;
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
  maxUses: number;
  uses: number;
}
