export interface MongoCommunityChannelMessagePinDocument {
  _id: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  messageId: string;
  pinnedByIdentityId: string;
}
