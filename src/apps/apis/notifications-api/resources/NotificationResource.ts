export type NotificationResource = {
  id: string;
  payload:
    | {
        communityId: string;
        inviterIdentityId: string;
        nonce: string;
        recipientIdentityId: string;
      }
    | {
        conversationId: string;
        encryptedConversationKey: string;
        inviterIdentityId: string;
        nonce: string;
        recipientIdentityId: string;
      }
    | {
        callId: string;
        callerIdentityId: string;
        networkId: string;
        recipientIdentityId: string;
      };
  recipientIdentityId: string;
  state: string;
  status: string;
  type: string;
};
