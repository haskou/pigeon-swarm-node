export interface OrbitDBPollDocument extends Record<string, unknown> {
  allowsMultipleVotes: boolean;
  createdAt: number;
  creatorIdentityId: string;
  expiresAt?: number;
  id: string;
  networkId: string;
  options: {
    id: string;
    text: string;
  }[];
  question: string;
  scope: {
    channelId: string | undefined;
    communityId: string | undefined;
    conversationId: string | undefined;
    type: string;
  };
  status: string;
  updatedAt?: number;
  votes: {
    createdAt: number;
    optionIds: string[];
    voterIdentityId: string;
  }[];
}
