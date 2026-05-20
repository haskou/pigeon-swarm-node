import { PollResource } from '@app/apps/apis/polls-api/resources/PollResource';

import { CommunityChannelMessageResource } from './CommunityChannelMessageResource';

export type CommunityChannelTimelineItemResource =
  | CommunityChannelMessageResource
  | PollResource;

export interface CommunityChannelMessagesResource {
  channelId: string;
  communityId: string;
  messages: CommunityChannelTimelineItemResource[];
  nextBeforeMessageId?: string;
}
