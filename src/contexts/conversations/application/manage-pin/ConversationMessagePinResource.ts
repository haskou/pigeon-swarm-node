import { Message } from '../../domain/entities/messages/Message';

export type ConversationMessagePinResource = {
  createdAt: number;
  message: Message;
  messageId: string;
  pinnedByIdentityId: string;
};
