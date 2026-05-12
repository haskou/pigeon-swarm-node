export interface ConversationResource {
  id: string;
  networkId: string;
  participantIds: string[];
  type: 'one-to-one';
}
