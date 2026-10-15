export interface LocalConversationDraftDocument extends Record<
  string,
  unknown
> {
  _id: string;
  draftKey: string;
  encryptedPayload: string;
  identityId: string;
  updatedAt: number;
}
