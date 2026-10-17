export type OrbitDBCommunityInvitationClaimDocument = {
  communityId: string;
  consent: string;
  id: string;
  identityId: string;
  invitationId: string;
  possession: string;
  proof: Record<string, unknown>;
  scopeType: 'community_invitation_claim';
};
