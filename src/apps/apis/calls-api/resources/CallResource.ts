export interface CallResource {
  createdAt: number;
  creatorIdentityId: string;
  endedAt?: number;
  id: string;
  networkId: string;
  participantIds: string[];
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  status: string;
}
