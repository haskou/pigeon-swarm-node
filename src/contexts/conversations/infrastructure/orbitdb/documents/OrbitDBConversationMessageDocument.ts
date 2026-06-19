import { MessageTypeValue } from '../../../domain/value-objects/types/MessageTypeValue';

export interface OrbitDBConversationMessageDocument extends Record<
  string,
  unknown
> {
  attachmentExternalIdentifiers: string[];
  authorId: string;
  conversationId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  lastEventId?: string;
  lastEventType?: string;
  messageId: string;
  networkId?: string;
  pollId?: string;
  previousMessageIds: string[];
  receivedAt?: number;
  recipientIds?: string[];
  replyToMessageId?: string;
  scopeType: 'conversation';
  signature: string;
  targetMessageId?: string;
  type: MessageTypeValue;
  valid?: boolean;
}
