export interface OrbitDBCallDocument extends Record<string, unknown> {
  createdAt: number;
  creatorIdentityId: string;
  endedAt?: number;
  endedByIdentityId?: string;
  id: string;
  networkId: string;
  participantIds: string[];
  participants: Array<{
    declinedAt?: number;
    identityId: string;
    joinedAt?: number;
    lastSeenAt?: number;
    leftAt?: number;
    missedAt?: number;
    status: string;
  }>;
  scope: {
    channelId: string | undefined;
    communityId: string | undefined;
    conversationId: string | undefined;
    type: string;
  };
  status: string;
  updatedAt?: number;
}
