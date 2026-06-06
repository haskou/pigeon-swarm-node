export interface CommunityChannelThreadSummaryDocument {
  _id: {
    channelId: string;
    rootMessageId: string;
  };
  lastReplyAt: number;
  lastReplyMessageId: string;
  replyCount: number;
}
