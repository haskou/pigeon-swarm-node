import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { assert } from '@haskou/value-objects';

import { CommunityOperationLimitExceededError } from '../errors/CommunityOperationLimitExceededError';
import { CommunityJoinMethod } from '../value-objects/CommunityJoinMethod';
import { CommunityOperationAction } from '../value-objects/CommunityOperationAction';
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
   * Levels `args` may nest, `args` itself counting as depth 0. The operation
   * digest refuses a value deeper than `PublicMutationProof.MAX_PAYLOAD_DEPTH`
   * below the operation, and `args` sits one level below it, so deeper
   * arguments are refused here, as a limit, before the digest is taken.
   */
  public static readonly MAX_ARGUMENT_DEPTH =
    PublicMutationProof.MAX_PAYLOAD_DEPTH - 1;

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
    assert(
      PublicMutationProof.depthOf(args) <=
        CommunityOperationLimits.MAX_ARGUMENT_DEPTH,
      new CommunityOperationLimitExceededError(),
    );
  }

  public static isAuthorQuotaReached(count: number): boolean {
    return count >= CommunityOperationLimits.MAX_OPERATIONS_PER_AUTHOR;
  }

  /**
   * The identity whose quota an operation counts toward: the joiner of an
   * admission through an invitation, who consented to it, so link holders
   * never spend the quota of the manager that admits them; the author of any
   * other operation.
   */
  public static responsibleOf(operation: CommunityOperation): string {
    const { identityId, method } = operation.getArguments();

    return operation
      .getAction()
      .isEqual(CommunityOperationAction.MEMBER_JOINED) &&
      method === CommunityJoinMethod.INVITATION.valueOf() &&
      typeof identityId === 'string'
      ? identityId
      : operation.getAuthorIdentityId().valueOf();
  }

  /**
   * Throws when `past`, the causal past of a candidate, already holds the
   * quota of operations of its responsible identity (see `responsibleOf`),
   * who is not the founder: whatever the order of arrival, the fold would
   * skip the candidate.
   */
  public static assertAuthorQuota(
    past: CommunityOperation[],
    candidate: CommunityOperation,
  ): void {
    const responsible = CommunityOperationLimits.responsibleOf(candidate);
    const genesis = past.find((operation) => operation.isGenesis());

    if (genesis?.getAuthorIdentityId().valueOf() === responsible) return;

    const signed = past.filter(
      (operation) =>
        CommunityOperationLimits.responsibleOf(operation) === responsible,
    ).length;

    assert(
      !CommunityOperationLimits.isAuthorQuotaReached(signed),
      new CommunityOperationLimitExceededError(),
    );
  }
}
