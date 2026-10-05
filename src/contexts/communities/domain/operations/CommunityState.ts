import { Community } from '../Community';

export type CommunityState = {
  /** The community after every permitted operation, when a genesis is known. */
  community?: Community;
  /** True once the last member left: later operations are never applied. */
  deleted: boolean;
  /** Digests of the operations nobody references as parent, sorted. */
  frontier: string[];
  /** Digests of the operations that were not permitted at their turn. */
  skipped: string[];
};
