export interface CommunityInviteResource {
  communityId: string;
  encryptedCommunityKey?: {
    algorithm: string;
    ciphertext: string;
    nonce: string;
    version: number;
  };
  expiresAt?: number;
  inviteToken: string;
  maxUses: number;
  uses: number;
}
