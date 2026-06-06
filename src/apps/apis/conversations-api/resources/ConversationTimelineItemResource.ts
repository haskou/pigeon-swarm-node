import { PollResource } from '@app/apps/apis/polls-api/resources/PollResource';

import { ConversationCallEventResource } from './ConversationCallEventResource';
import { MessageResource } from './MessageResource';

export type ConversationTimelineItemResource =
  | ConversationCallEventResource
  | MessageResource
  | PollResource;
