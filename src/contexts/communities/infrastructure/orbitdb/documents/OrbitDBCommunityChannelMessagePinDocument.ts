export interface OrbitDBCommunityChannelMessagePinDocument extends Record<
  string,
  unknown
> {
  id: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  messageId: string;
  pinnedByIdentityId: string;
  removed?: boolean;
}
