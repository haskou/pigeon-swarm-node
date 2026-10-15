export type OrbitDBNotificationInvitationDocument = {
  encryptedKey?: string;
  id: string;
  inviterIdentityId: string;
  nonce: string;
  recipientIdentityId: string;
  scopeType: 'notification_invitation';
  /** The community or one-to-one conversation; a group letter names none. */
  subjectId?: string;
  type: string;
};
