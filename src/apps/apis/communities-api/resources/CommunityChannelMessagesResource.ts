import { CommunityChannelTimelineItemResource } from './CommunityChannelTimelineItemResource';

export { CommunityChannelTimelineItemResource } from './CommunityChannelTimelineItemResource';

export interface CommunityChannelMessagesResource {
  channelId: string;
  communityId: string;
  messages: CommunityChannelTimelineItemResource[];
  nextBeforeMessageId?: string;
}
