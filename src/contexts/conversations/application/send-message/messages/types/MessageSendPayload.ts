export type MessageSendPayload = {
  attachmentExternalIdentifiers?: string[];
  createdAt: number;
  encryptedPayload: string;
  id: string;
  previousMessageIds?: string[];
  replyToMessageId?: string;
  signature: string;
};
