import { PollResource } from '@app/apps/apis/polls-api/resources/PollResource';

import { CommunityChannelMessageResource } from './CommunityChannelMessageResource';

export type CommunityChannelTimelineItemResource =
  | CommunityChannelMessageResource
  | PollResource;
