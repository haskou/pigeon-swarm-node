import { assert } from '@haskou/value-objects';

import { ConversationOperationLimitExceededError } from '../errors/ConversationOperationLimitExceededError';
import { ConversationOperation } from './ConversationOperation';
import { ConversationOperationArguments } from './ConversationOperationArguments';

/**
 * Bounds on what one member can make every replica of a conversation store and
 * fold. Every limit is decided from the signed record itself and from the
 * operations it builds on, never from the clock or the arrival order, so every
 * node refuses or skips exactly the same operations.
 *
 * Operations cannot be dropped once stored: any honest operation may name
 * them as parents, and a node that forgot one would reject its children. The
 * limits therefore stop growth at admission and in the fold instead of
 * pruning.
 */
export class ConversationOperationLimits {
  /** Canonical JSON size of `args`; a group name and a participant list fit. */
  public static readonly MAX_ARGUMENT_BYTES = 4_096;

  /** Members of one group, whether named at creation or added later. */
  public static readonly MAX_GROUP_PARTICIPANTS = 256;

  /**
   * Operations one identity may sign in one conversation, for its whole life.
   * The creator (the author of the genesis) is exempt: it is the root of trust
   * and moderates every member, so a quota would lock it out of its own group.
   */
  public static readonly MAX_OPERATIONS_PER_AUTHOR: number = 1_000;

  public static assertArguments(args: ConversationOperationArguments): void {
    assert(
      Buffer.byteLength(JSON.stringify(args)) <=
        ConversationOperationLimits.MAX_ARGUMENT_BYTES,
      new ConversationOperationLimitExceededError(),
    );
  }

  public static isAuthorQuotaReached(count: number): boolean {
    return count >= ConversationOperationLimits.MAX_OPERATIONS_PER_AUTHOR;
  }

  /**
   * Throws when `past`, the causal past of a candidate, already holds the
   * quota of operations of its author, who is not the creator: whatever the
   * order of arrival, the fold would skip the candidate.
   */
  public static assertAuthorQuota(
    past: ConversationOperation[],
    candidate: ConversationOperation,
  ): void {
    const author = candidate.getAuthorIdentityId();
    const genesis = past.find((operation) => operation.isGenesis());

    if (genesis?.getAuthorIdentityId().isEqual(author)) return;

    const signed = past.filter((operation) =>
      operation.getAuthorIdentityId().isEqual(author),
    ).length;

    assert(
      !ConversationOperationLimits.isAuthorQuotaReached(signed),
      new ConversationOperationLimitExceededError(),
    );
  }
}
