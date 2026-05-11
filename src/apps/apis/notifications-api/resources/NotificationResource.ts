export type NotificationResource = {
  createdAt: number;
  id: string;
  payload: {
    conversationId: string;
    encryptedConversationKey: string;
    inviterIdentityId: string;
    keychainExternalIdentifier?: string;
    recipientIdentityId: string;
    inviterSignature: string;
  };
  recipientIdentityId: string;
  state: string;
  status: string;
  type: string;
};
