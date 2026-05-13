export interface CallResource {
  createdAt: number;
  creatorIdentityId: string;
  endedAt?: number;
  id: string;
  networkId: string;
  participantIds: string[];
  participants: Array<{
    declinedAt?: number;
    identityId: string;
    joinedAt?: number;
    leftAt?: number;
    missedAt?: number;
    status: string;
  }>;
  scope: {
    channelId?: string;
    communityId?: string;
    conversationId?: string;
    type: string;
  };
  status: string;
}
