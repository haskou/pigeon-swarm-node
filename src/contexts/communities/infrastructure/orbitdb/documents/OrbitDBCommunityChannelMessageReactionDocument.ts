export interface OrbitDBCommunityChannelMessageReactionDocument extends Record<
  string,
  unknown
> {
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  emoji: string;
  id: string;
  messageId: string;
  removed?: boolean;
  scopeType: 'community_channel';
}
