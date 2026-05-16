export interface MongoCommunityChannelMessageReactionDocument {
  _id: string;
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  emoji: string;
  messageId: string;
}
