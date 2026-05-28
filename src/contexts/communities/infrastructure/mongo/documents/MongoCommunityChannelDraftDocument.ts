export interface MongoCommunityChannelDraftDocument {
  _id: string;
  channelId: string;
  communityId: string;
  encryptedPayload: string;
  identityId: string;
  updatedAt: number;
}
