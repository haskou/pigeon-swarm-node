export interface MessageResource {
  authorIdentityId: string;
  conversationId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  previousMessageIds: string[];
  reactions: {
    authorIdentityId: string;
    createdAt: number;
    emoji: string;
  }[];
  replyToMessageId?: string;
  targetMessageId?: string;
  type: string;
}
