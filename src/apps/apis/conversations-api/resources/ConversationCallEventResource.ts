export type ConversationCallEventType = 'declined' | 'ended' | 'missed';

export interface ConversationCallEventResource {
  actorIdentityId: string;
  callEventType: ConversationCallEventType;
  callId: string;
  conversationId: string;
  createdAt: number;
  durationMs: number;
  id: string;
  type: 'call_event';
}
