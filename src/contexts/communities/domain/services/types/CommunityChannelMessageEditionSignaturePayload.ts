import { CommunityChannelMessageMentionPrimitives } from './CommunityChannelMessageMentionPrimitives';

export type CommunityChannelMessageEditionSignaturePayload = {
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
  type: 'edited';
};
