export interface OrbitDBConversationMessageDocument extends Record<
  string,
  unknown
> {
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
  type: string;
  valid?: boolean;
}
