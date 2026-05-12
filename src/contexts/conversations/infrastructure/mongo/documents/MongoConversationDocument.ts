export interface MongoConversationDocument {
  _id: string;
  createdAt: number;
  networkId: string;
  participantIds: string[];
  type: 'one-to-one';
}
