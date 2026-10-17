/** Only what a link holder needs to decide and to sign its proofs. */
export interface CommunityInvitationPreviewResource {
  communityAvatar?: string;
  communityBanner?: string;
  communityId: string;
  communityName: string;
  expiresAt: number;
  invitationId: string;
  networkId: string;
}
