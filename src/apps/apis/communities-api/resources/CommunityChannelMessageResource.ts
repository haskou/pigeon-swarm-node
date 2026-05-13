export interface CommunityChannelMessageResource {
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  encryptedPayload: string;
  id: string;
  signature: string;
  type: 'sent';
}
