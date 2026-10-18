import { ConversationDraftResource } from './ConversationDraftResource';

export interface ConversationDraftsResource {
  drafts: ConversationDraftResource[];
  nextCursor: string | null;
}
