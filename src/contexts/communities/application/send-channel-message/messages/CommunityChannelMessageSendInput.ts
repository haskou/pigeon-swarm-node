import { CommunityMentionTypeValue } from '../../../domain/value-objects/CommunityMentionType';

export type CommunityChannelMessageSendInput = {
  attachmentExternalIdentifiers?: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  encryptedPayload?: string;
  mentions?: Array<{ targetId?: string; type: CommunityMentionTypeValue }>;
  messageId: string;
  plaintextPayload?: string;
  replyToMessageId?: string;
  signature: string;
};
