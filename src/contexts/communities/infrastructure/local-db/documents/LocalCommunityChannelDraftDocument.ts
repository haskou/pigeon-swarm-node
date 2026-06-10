export interface LocalCommunityChannelDraftDocument extends Record<
  string,
  unknown
> {
  _id: string;
  channelId: string;
  communityId: string;
  encryptedPayload: string;
  identityId: string;
  updatedAt: number;
}
