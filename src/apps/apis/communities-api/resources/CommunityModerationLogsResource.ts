import { CommunityModerationLogResource } from './CommunityModerationLogResource';

export interface CommunityModerationLogsResource {
  logs: CommunityModerationLogResource[];
  nextCursor: string | null;
}
