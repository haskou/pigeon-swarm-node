export interface CommunityChannelMessageCandidate {
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  editedAt: number | undefined;
  encryptedPayload: string | undefined;
  id: string;
  mentions: Array<{ targetId: string | undefined; type: string }>;
  plaintextPayload: string | undefined;
  pollId: string | undefined;
  replyToMessageId: string | undefined;
  signature: string | undefined;
  type: 'poll' | 'sent';
}
