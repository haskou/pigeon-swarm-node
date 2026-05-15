export interface MongoUnreadConversationMessageDocument {
  _id: string;
  conversationId: string;
  createdAt: number;
  messageId: string;
  networkId: string | undefined;
  recipientIdentityId: string;
}
