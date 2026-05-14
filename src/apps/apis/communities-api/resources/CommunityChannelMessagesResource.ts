import { CommunityChannelMessageResource } from './CommunityChannelMessageResource';

export interface CommunityChannelMessagesResource {
  channelId: string;
  communityId: string;
  messages: CommunityChannelMessageResource[];
  nextBeforeMessageId?: string;
}
