export interface MongoConversationDocument {
  _id: string;
  createdAt: number;
  name?: string;
  networkId: string;
  participantIds: string[];
  type: 'group' | 'one-to-one';
}
