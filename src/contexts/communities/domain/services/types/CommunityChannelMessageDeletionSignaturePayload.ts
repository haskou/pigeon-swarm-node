export type CommunityChannelMessageDeletionSignaturePayload = {
  actorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  id: string;
  targetMessageId: string;
  type: 'deleted';
};
