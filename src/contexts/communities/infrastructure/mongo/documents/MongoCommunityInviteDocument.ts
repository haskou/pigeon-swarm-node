export interface MongoCommunityInviteDocument {
  _id: string;
  communityId: string;
  createdAt: number;
  creatorIdentityId: string;
  expiresAt?: number;
  maxUses: number;
  uses: number;
}
