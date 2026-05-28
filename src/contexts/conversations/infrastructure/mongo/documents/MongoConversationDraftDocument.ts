export interface MongoConversationDraftDocument {
  _id: string;
  conversationId: string;
  encryptedPayload: string;
  identityId: string;
  updatedAt: number;
}
