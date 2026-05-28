import { CommunityMentionTypeValue } from '@app/contexts/communities/domain/value-objects/CommunityMentionType';

export interface MongoCommunityChannelMessageDocument {
  _id: string;
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  editedAt?: number;
  encryptedPayload?: string;
  mentions?: {
    targetId: string | undefined;
    type: CommunityMentionTypeValue;
  }[];
  plaintextPayload?: string;
  pollId?: string;
  replyToMessageId?: string;
  signature?: string;
  type: 'poll' | 'sent';
}
