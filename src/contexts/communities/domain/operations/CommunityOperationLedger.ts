import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Community } from '../Community';
import { InvalidCommunityOperationError } from '../errors/InvalidCommunityOperationError';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationApplier } from './CommunityOperationApplier';
import { CommunityOperationLimits } from './CommunityOperationLimits';
import { CommunityStateFold } from './CommunityStateFold';

/**
 * The verified operations of one community. Admitting an operation applies it
 * to the state of its causal past, so a forged operation (an author without
 * the permission at that point of history, or a parent nobody has seen) is
 * refused before it is stored anywhere.
 *
 * An identity may sign a bounded number of operations of the causal past of
 * each new one (see `CommunityOperationLimits`): later ones are refused.
 *
 * The state after the latest admitted operations is remembered, so a linear
 * history is admitted in constant work instead of folding it again.
 */
export class CommunityOperationLedger {
  private static readonly MAX_REMEMBERED_STATES = 64;

  private readonly operations = new Map<string, CommunityOperation>();

  /** Admitted operations per author, whatever branch they are on. */
  private readonly signed = new Map<string, number>();

  private readonly states = new Map<string, PrimitiveOf<Community>>();

  private applyToPast(candidate: CommunityOperation): Community {
    const community = Community.fromPrimitives(
      this.pastOf(candidate.getParents()),
    );

    assert(
      candidate.getCommunityId().isEqual(community.getId()),
      new InvalidCommunityOperationError(),
    );
    CommunityOperationApplier.apply(community, candidate);

    return community;
  }

  /**
   * Only an author with a quota of operations on some branch can have it in
   * the past of a candidate, so the past is walked for those authors alone.
   */
  private assertWithinQuota(candidate: CommunityOperation): void {
    const author = candidate.getAuthorIdentityId().valueOf();

    if (
      !CommunityOperationLimits.isAuthorQuotaReached(
        this.signed.get(author) ?? 0,
      )
    ) {
      return;
    }

    CommunityOperationLimits.assertAuthorQuota(
      CommunityStateFold.closureOf(
        [...this.operations.values()],
        candidate.getParents(),
      ),
      candidate,
    );
  }

  /** The community folded from the causal past of `parents`, inclusive. */
  private pastOf(parents: string[]): PrimitiveOf<Community> {
    const remembered =
      parents.length === 1 ? this.states.get(parents[0]) : undefined;

    if (remembered) return remembered;

    const past = CommunityStateFold.fold(
      CommunityStateFold.closureOf([...this.operations.values()], parents),
    );

    assert(
      past.community && !past.deleted,
      new InvalidCommunityOperationError(),
    );

    return past.community.toPrimitives();
  }

  private remember(hash: string, community: Community): void {
    // After the last member left nothing can be applied any more.
    if (!community.hasMembers()) return;

    this.states.set(hash, community.toPrimitives());

    if (this.states.size > CommunityOperationLedger.MAX_REMEMBERED_STATES) {
      this.states.delete(this.states.keys().next().value as string);
    }
  }

  public has(operation: CommunityOperation): boolean {
    return this.operations.has(operation.getHash());
  }

  /** Throws when `candidate` is not permitted in the history it builds on. */
  public admit(candidate: CommunityOperation): void {
    if (this.has(candidate)) return;

    if (!candidate.isGenesis()) this.assertWithinQuota(candidate);

    const community = candidate.isGenesis()
      ? CommunityOperationApplier.create(candidate)
      : this.applyToPast(candidate);
    const author = candidate.getAuthorIdentityId().valueOf();

    this.operations.set(candidate.getHash(), candidate);
    this.signed.set(author, (this.signed.get(author) ?? 0) + 1);
    this.remember(candidate.getHash(), community);
  }
}
