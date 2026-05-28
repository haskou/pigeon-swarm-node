import { MessageResource } from './MessageResource';

export interface ConversationMessagePinResource {
  createdAt: number;
  message: MessageResource;
  messageId: string;
  pinnedByIdentityId: string;
}
