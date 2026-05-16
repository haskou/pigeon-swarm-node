export interface CommunityInviteResource {
  communityId: string;
  expiresAt?: number;
  inviteToken: string;
  maxUses: number;
}
