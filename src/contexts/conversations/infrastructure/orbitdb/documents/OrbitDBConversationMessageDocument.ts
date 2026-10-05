/**
 * Immutable, client-signed message record. The stored record is this document
 * plus the `proof` field; nothing else is allowed in it.
 */
export interface OrbitDBConversationMessageDocument extends Record<
  string,
  unknown
> {
  authorId: string;
  conversationId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  pollId?: string;
  previousMessageIds: string[];
  replyToMessageId?: string;
  scopeType: 'conversation';
  targetMessageId?: string;
  type: string;
}
