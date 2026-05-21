import { CommunityMentionTypeValue } from '@app/contexts/communities/domain/value-objects/CommunityMentionType';

export interface CommunityChannelMessageResource {
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  editedAt?: number;
  encryptedPayload?: string;
  id: string;
  mentions: {
    targetId: string | undefined;
    type: CommunityMentionTypeValue;
  }[];
  reactions: {
    authorIdentityId: string;
    createdAt: number;
    emoji: string;
  }[];
  pollId?: string;
  signature?: string;
  type: 'poll' | 'sent';
}
