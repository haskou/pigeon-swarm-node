export interface OrbitDBConversationDocument {
  createdAt: number;
  id: string;
  lastEventId?: string;
  lastEventType?: string;
  name?: string;
  networkId: string;
  participantIds: string[];
  receivedAt?: number;
  type: 'group' | 'one-to-one';
  updatedAt?: number;
}
