import { ConversationMessagePinResource } from './ConversationMessagePinResource';

export interface ConversationMessagePinsResource {
  conversationId: string;
  pins: ConversationMessagePinResource[];
}
