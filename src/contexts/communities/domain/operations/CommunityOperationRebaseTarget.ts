import { Community } from '../Community';
import { CommunityOperationSnapshot } from './CommunityOperationSnapshot';

/** What a whole-value operation sets, and the same value in a state. */
export interface CommunityOperationRebaseTarget {
  /** The values the operation sets, read strictly from its arguments. */
  intended: CommunityOperationSnapshot;
  /** The same values in a community state; undefined when it lacks them. */
  of: (community: Community) => CommunityOperationSnapshot | undefined;
}
