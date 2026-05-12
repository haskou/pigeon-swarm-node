export interface DeletedCommunityChannelMessageResource {
  channelId: string;
  communityId: string;
  deletedByIdentityId: string;
  id: string;
  targetMessageId: string;
  type: 'deleted';
}
