export interface ConversationResource {
  id: string;
  name?: string;
  networkId: string;
  participantIds: string[];
  type: 'group' | 'one-to-one';
  unreadCount: number;
}
