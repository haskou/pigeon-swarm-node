import { MessageResource } from './MessageResource';

export interface MessagesAroundResource {
  messages: MessageResource[];
  nextCursor?: string;
  previousCursor?: string;
}
