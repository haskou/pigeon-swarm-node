import { ConversationCallEventType } from './ConversationCallEventType';

export { ConversationCallEventType } from './ConversationCallEventType';

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
