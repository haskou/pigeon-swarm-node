import { ConversationResource } from './ConversationResource';

export interface ConversationsResource {
  conversations: ConversationResource[];
  nextBeforeConversationId?: string;
}
