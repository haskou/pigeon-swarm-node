export interface MongoConversationMessagePinDocument {
  _id: string;
  conversationId: string;
  createdAt: number;
  messageId: string;
  pinnedByIdentityId: string;
}
