export interface OrbitDBConversationMessagePinDocument extends Record<
  string,
  unknown
> {
  id: string;
  conversationId: string;
  createdAt: number;
  messageId: string;
  pinnedByIdentityId: string;
  removed?: boolean;
}
