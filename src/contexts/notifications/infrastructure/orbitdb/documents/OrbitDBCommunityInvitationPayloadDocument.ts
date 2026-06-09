export type OrbitDBCommunityInvitationPayloadDocument = {
  communityId: string;
  encryptedCommunityKey: string;
  inviterIdentityId: string;
  inviterSignature: string;
  recipientIdentityId: string;
};
