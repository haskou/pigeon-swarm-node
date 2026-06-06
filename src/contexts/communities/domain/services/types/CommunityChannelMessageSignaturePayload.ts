import { CommunityChannelMessageMentionPrimitives } from './CommunityChannelMessageMentionPrimitives';

export type CommunityChannelMessageSignaturePayload = {
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  mentions?: CommunityChannelMessageMentionPrimitives;
  plaintextPayload?: string;
  replyToMessageId?: string;
  type: 'poll' | 'sent';
};
