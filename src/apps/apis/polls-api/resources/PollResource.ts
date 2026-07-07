export interface PollResource {
  allowsMultipleVotes: boolean;
  createdAt: number;
  creatorIdentityId: string;
  expiresAt?: number;
  id: string;
  options: {
    id: string;
    text: string;
  }[];
  question: string;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  status: string;
  type: 'poll';
  votes: {
    createdAt: number;
    optionIds: string[];
    voterIdentityId: string;
  }[];
}
