import { Message } from '../../domain/Message';

export type ConversationMessagePinResource = {
  createdAt: number;
  message: Message;
  messageId: string;
  pinnedByIdentityId: string;
};
