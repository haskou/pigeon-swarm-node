import { CommunityChannelCallEventResource } from './CommunityChannelCallEventResource';
import { CommunityChannelMessageResource } from './CommunityChannelMessageResource';

export type CommunityChannelTimelineItemResource =
  | CommunityChannelCallEventResource
  | CommunityChannelMessageResource;

export interface CommunityChannelMessagesResource {
  channelId: string;
  communityId: string;
  messages: CommunityChannelTimelineItemResource[];
  nextBeforeMessageId?: string;
}
