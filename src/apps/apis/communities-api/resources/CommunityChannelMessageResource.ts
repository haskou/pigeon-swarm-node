import { CommunityMentionTypeValue } from '@app/contexts/communities/domain/value-objects/CommunityMentionType';

export interface CommunityChannelMessageResource {
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  encryptedPayload: string;
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
  signature: string;
  type: 'sent';
}
