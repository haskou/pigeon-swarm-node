import { communityModerationTargetTypes as targetTypes } from './CommunityModerationTargetTypes';

export type CommunityModerationTargetTypeValue =
  (typeof targetTypes)[keyof typeof targetTypes];
