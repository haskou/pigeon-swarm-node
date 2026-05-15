import { ConversationCallEventResource } from './ConversationCallEventResource';
import { MessageResource } from './MessageResource';

export type ConversationTimelineItemResource =
  | ConversationCallEventResource
  | MessageResource;

export interface MessagesResource {
  conversationId: string;
  messages: ConversationTimelineItemResource[];
  nextBeforeMessageId?: string;
}

export interface MessagesAroundResource {
  messages: MessageResource[];
  nextCursor?: string;
  previousCursor?: string;
}
