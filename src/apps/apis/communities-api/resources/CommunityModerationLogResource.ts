import { CommunityModerationLogTargetResource } from './CommunityModerationLogTargetResource';

export { CommunityModerationLogTargetResource } from './CommunityModerationLogTargetResource';
export { CommunityModerationLogsResource } from './CommunityModerationLogsResource';

export interface CommunityModerationLogResource {
  action: string;
  actorIdentityId: string;
  communityId: string;
  createdAt: number;
  details: Record<string, unknown>;
  id: string;
  target: CommunityModerationLogTargetResource;
}
