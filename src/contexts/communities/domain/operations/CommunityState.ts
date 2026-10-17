import { Community } from '../Community';
import { CommunityInvitations } from '../entities/invitations/CommunityInvitations';

export type CommunityState = {
  /** The community after every permitted operation, when a genesis is known. */
  community?: Community;
  /** True once the last member left: later operations are never applied. */
  deleted: boolean;
  /** Digests of the operations nobody references as parent, sorted. */
  frontier: string[];
  /**
   * The invitations of the operations, with their uses, revocations and
   * cuts. Kept apart from the community, whose primitives are served to
   * anyone who can read it, so invitation keys never leave the operations.
   */
  invitations: CommunityInvitations;
  /** Digests of the operations that were not permitted at their turn. */
  skipped: string[];
};
