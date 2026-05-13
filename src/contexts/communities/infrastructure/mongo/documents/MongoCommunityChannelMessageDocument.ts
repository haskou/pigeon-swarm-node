export interface MongoCommunityChannelMessageDocument {
  _id: string;
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  encryptedPayload: string;
  signature: string;
  type: 'sent';
}
