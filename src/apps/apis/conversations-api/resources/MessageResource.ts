export interface MessageResource {
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  conversationId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  previousMessageIds: string[];
  targetMessageId?: string;
  type: string;
}
