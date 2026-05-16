export interface MongoMessageReactionDocument {
  _id: string;
  authorId: string;
  conversationId: string;
  createdAt: number;
  emoji: string;
  messageId: string;
}
