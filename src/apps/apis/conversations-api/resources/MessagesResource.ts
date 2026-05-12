import { MessageResource } from './MessageResource';

export interface MessagesResource {
  conversationId: string;
  messages: MessageResource[];
  nextBeforeMessageId?: string;
}

export interface MessagesAroundResource {
  messages: MessageResource[];
  nextCursor?: string;
  previousCursor?: string;
}
