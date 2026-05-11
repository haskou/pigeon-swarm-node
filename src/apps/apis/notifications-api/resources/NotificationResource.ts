export type NotificationResource = {
  archivedAt?: number;
  createdAt: number;
  id: string;
  payload: {
    conversationId: string;
    encryptedConversationKey: string;
    inviterIdentityId: string;
    keyEncryptionAlgorithm?: string;
    keychainExternalIdentifier?: string;
    recipientIdentityId: string;
    signature: string;
  };
  recipientIdentityId: string;
  state: string;
  status: string;
  type: string;
};
