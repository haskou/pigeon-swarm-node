export interface LocalConversationDraftDocument extends Record<
  string,
  unknown
> {
  _id: string;
  conversationId: string;
  encryptedPayload: string;
  identityId: string;
  updatedAt: number;
}
