export type MessageSignaturePayload = {
  attachmentExternalIdentifiers: string[];
  authorId: string;
  conversationId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  previousMessageIds: string[];
  replyToMessageId?: string;
  targetMessageId?: string;
  type: string;
};
