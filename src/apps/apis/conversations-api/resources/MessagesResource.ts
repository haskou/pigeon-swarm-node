import { ConversationTimelineItemResource } from './ConversationTimelineItemResource';

export { ConversationTimelineItemResource } from './ConversationTimelineItemResource';
export { MessagesAroundResource } from './MessagesAroundResource';

export interface MessagesResource {
  conversationId: string;
  messages: ConversationTimelineItemResource[];
  nextBeforeMessageId?: string;
}
