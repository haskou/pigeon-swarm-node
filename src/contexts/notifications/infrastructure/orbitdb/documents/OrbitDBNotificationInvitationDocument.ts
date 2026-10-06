export type OrbitDBNotificationInvitationDocument = {
  encryptedKey: string;
  id: string;
  inviterIdentityId: string;
  nonce: string;
  recipientIdentityId: string;
  scopeType: 'notification_invitation';
  subjectId: string;
  type: string;
};
