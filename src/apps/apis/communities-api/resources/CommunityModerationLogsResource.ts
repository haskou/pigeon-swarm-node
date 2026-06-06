import { CommunityModerationLogResource } from './CommunityModerationLogResource';

export interface CommunityModerationLogsResource {
  logs: CommunityModerationLogResource[];
  nextBeforeLogId?: string;
}
