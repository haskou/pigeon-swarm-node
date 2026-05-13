export interface MongoCallDocument {
  _id: string;
  createdAt: number;
  creatorIdentityId: string;
  endedAt?: number;
  networkId: string;
  participantIds: string[];
  scope: {
    channelId: string | undefined;
    communityId: string | undefined;
    conversationId: string | undefined;
    type: string;
  };
  participants?: Array<{
    declinedAt?: number;
    identityId: string;
    joinedAt?: number;
    leftAt?: number;
    missedAt?: number;
    status: string;
  }>;
  status: string;
}
