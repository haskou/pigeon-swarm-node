export type NotificationResource = {
  createdAt: number;
  id: string;
  payload:
    | {
        communityId: string;
        encryptedCommunityKey: string;
        inviterIdentityId: string;
        inviterSignature: string;
        recipientIdentityId: string;
      }
    | {
        conversationId: string;
        encryptedConversationKey: string;
        inviterIdentityId: string;
        inviterSignature: string;
        recipientIdentityId: string;
      };
  recipientIdentityId: string;
  state: string;
  status: string;
  type: string;
};
