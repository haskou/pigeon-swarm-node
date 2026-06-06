import { communityModerationActions } from './CommunityModerationActions';

export type CommunityModerationActionValue =
  (typeof communityModerationActions)[keyof typeof communityModerationActions];
