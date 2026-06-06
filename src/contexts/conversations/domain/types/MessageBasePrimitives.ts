export type MessageBasePrimitives = {
  attachmentExternalIdentifiers: string[];
  authorId: string;
  conversationId: string;
  createdAt: number;
  id: string;
  previousMessageIds: string[];
  replyToMessageId?: string;
  signature: string;
};
