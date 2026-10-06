import { assert } from '@haskou/value-objects';

import { CommunityOperationLimitExceededError } from '../errors/CommunityOperationLimitExceededError';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationArguments } from './CommunityOperationArguments';

/**
 * Bounds on what one member can make every replica of a community store and
 * fold. Both limits are decided from the signed record itself and from the
 * operations it builds on, never from the clock or the arrival order, so every
 * node refuses or skips exactly the same operations.
 *
 * Operations cannot be dropped once stored: any honest operation may name
 * them as parents, and a node that forgot one would reject its children. The
 * limits therefore stop growth at admission and in the fold instead of
 * pruning.
 */
export class CommunityOperationLimits {
  /** Canonical JSON size of `args`; a name, a description and a CID fit many times over. */
  public static readonly MAX_ARGUMENT_BYTES = 4_096;

  /**
   * Operations one identity may sign in one community, for its whole life.
   * The founder (the author of the genesis) is exempt: it is the root of trust,
   * and the one that approves and moderates every member, so a quota would
   * lock it out of its own community.
   */
  public static readonly MAX_OPERATIONS_PER_AUTHOR: number = 1_000;

  public static assertArguments(args: CommunityOperationArguments): void {
    assert(
      Buffer.byteLength(JSON.stringify(args)) <=
        CommunityOperationLimits.MAX_ARGUMENT_BYTES,
      new CommunityOperationLimitExceededError(),
    );
  }

  public static isAuthorQuotaReached(count: number): boolean {
    return count >= CommunityOperationLimits.MAX_OPERATIONS_PER_AUTHOR;
  }

  /**
   * Throws when `past`, the causal past of a candidate, already holds the
   * quota of operations of its author, who is not the founder: whatever the
   * order of arrival, the fold would skip the candidate.
   */
  public static assertAuthorQuota(
    past: CommunityOperation[],
    candidate: CommunityOperation,
  ): void {
    const author = candidate.getAuthorIdentityId();
    const genesis = past.find((operation) => operation.isGenesis());

    if (genesis?.getAuthorIdentityId().isEqual(author)) return;

    const signed = past.filter((operation) =>
      operation.getAuthorIdentityId().isEqual(author),
    ).length;

    assert(
      !CommunityOperationLimits.isAuthorQuotaReached(signed),
      new CommunityOperationLimitExceededError(),
    );
  }
}
