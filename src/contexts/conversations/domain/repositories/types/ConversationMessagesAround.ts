import { Message } from '../../entities/messages/Message';

export interface ConversationMessagesAround {
  messages: Message[];
  nextCursor?: string;
  previousCursor?: string;
}
