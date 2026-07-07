export interface OrbitDBCommunityChannelMessageDocument extends Record<
  string,
  unknown
> {
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  deleted?: boolean;
  deletedAt?: number;
  editedAt?: number;
  encryptedPayload?: string;
  id: string;
  mentions?: {
    targetId: string | undefined;
    type: string;
  }[];
  messageId?: string;
  plaintextPayload?: string;
  pollId?: string;
  replyToMessageId?: string;
  scopeType: 'community_channel';
  signature?: string;
  type: 'poll' | 'sent';
}
