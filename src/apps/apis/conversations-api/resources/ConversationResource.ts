export interface ConversationResource {
  adminIds: string[];
  creatorId?: string;
  id: string;
  name?: string;
  networkId: string;
  participantIds: string[];
  type: 'group' | 'one-to-one';
  unreadCount: number;
}
