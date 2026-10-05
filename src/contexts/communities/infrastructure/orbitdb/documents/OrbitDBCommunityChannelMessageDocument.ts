export interface OrbitDBCommunityChannelMessageDocument extends Record<
  string,
  unknown
> {
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  editedAt?: number;
  encryptedPayload?: string;
  id: string;
  mentions?: {
    targetId: string | undefined;
    type: string;
  }[];
  messageId: string;
  plaintextPayload?: string;
  pollId?: string;
  replyToMessageId?: string;
  scopeType: 'community_channel';
  type: 'poll' | 'sent';
}
