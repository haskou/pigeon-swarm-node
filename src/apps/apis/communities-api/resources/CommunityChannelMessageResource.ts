export interface CommunityChannelMessageResource {
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  editedAt?: number;
  encryptedPayload?: string;
  id: string;
  mentions: {
    targetId: string | undefined;
    type: string;
  }[];
  plaintextPayload?: string;
  reactions: {
    authorIdentityId: string;
    createdAt: number;
    emoji: string;
  }[];
  pollId?: string;
  replyToMessageId?: string;
  signature?: string;
  type: 'poll' | 'sent';
}
