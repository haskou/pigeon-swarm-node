export interface OrbitDBMessageReactionDocument extends Record<
  string,
  unknown
> {
  authorId: string;
  conversationId: string;
  createdAt: number;
  emoji: string;
  id: string;
  messageId: string;
  removed?: boolean;
  scopeType: 'conversation';
}
