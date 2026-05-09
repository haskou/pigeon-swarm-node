import { MessageResource } from './MessageResource';

export interface MessagesResource {
  conversationId: string;
  messages: MessageResource[];
  nextBeforeMessageId?: string;
}
