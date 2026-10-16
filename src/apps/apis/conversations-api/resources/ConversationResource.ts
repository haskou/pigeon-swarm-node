export interface ConversationResource {
  adminIds: string[];
  creatorId?: string;
  id: string;
  networkId: string;
  participantIds: string[];
  type: 'one-to-one';
}
