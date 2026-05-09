export interface MongoConversationDocument {
  _id: string;
  createdAt: number;
  participantIds: string[];
  type: 'one-to-one';
}
