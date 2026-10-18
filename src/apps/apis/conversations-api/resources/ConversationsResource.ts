import { ConversationResource } from './ConversationResource';

export interface ConversationsResource {
  conversations: ConversationResource[];
  nextCursor: string | null;
}
