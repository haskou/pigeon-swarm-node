import { Message } from '../../Message';

export interface ConversationMessagesAround {
  messages: Message[];
  nextCursor?: string;
  previousCursor?: string;
}
