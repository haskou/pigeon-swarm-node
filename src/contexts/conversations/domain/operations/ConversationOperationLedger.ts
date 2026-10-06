import { assert } from '@haskou/value-objects';

import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationOperation } from './ConversationOperation';
import { ConversationOperationApplier } from './ConversationOperationApplier';
import { ConversationOperationLimits } from './ConversationOperationLimits';
import {
  ConversationRoster,
  ConversationRosterPrimitives,
} from './ConversationRoster';
import { ConversationStateFold } from './ConversationStateFold';

/**
 * The verified operations of one conversation. Admitting an operation applies
 * it to the roster of its causal past, so a forged operation (an author
 * without the permission at that point of history, or a parent nobody has
 * seen) is refused before it is stored anywhere.
 *
 * An identity may sign a bounded number of operations of the causal past of
 * each new one (see `ConversationOperationLimits`): later ones are refused.
 *
 * The roster after the latest admitted operations is remembered, so a linear
 * history is admitted in constant work instead of folding it again.
 */
export class ConversationOperationLedger {
  private static readonly MAX_REMEMBERED_STATES = 64;

  private readonly operations = new Map<string, ConversationOperation>();

  /** Admitted operations per author, whatever branch they are on. */
  private readonly signed = new Map<string, number>();

  private readonly states = new Map<string, ConversationRosterPrimitives>();

  private applyToPast(candidate: ConversationOperation): ConversationRoster {
    const roster = ConversationRoster.fromPrimitives(
      this.pastOf(candidate.getParents()),
    );

    ConversationOperationApplier.apply(roster, candidate);

    return roster;
  }

  /**
   * Only an author with a quota of operations on some branch can have it in
   * the past of a candidate, so the past is walked for those authors alone.
   */
  private assertWithinQuota(candidate: ConversationOperation): void {
    const author = candidate.getAuthorIdentityId().valueOf();

    if (
      !ConversationOperationLimits.isAuthorQuotaReached(
        this.signed.get(author) ?? 0,
      )
    ) {
      return;
    }

    ConversationOperationLimits.assertAuthorQuota(
      ConversationStateFold.closureOf(
        [...this.operations.values()],
        candidate.getParents(),
      ),
      candidate,
    );
  }

  /** The roster folded from the causal past of `parents`, inclusive. */
  private pastOf(parents: string[]): ConversationRosterPrimitives {
    const remembered =
      parents.length === 1 ? this.states.get(parents[0]) : undefined;

    if (remembered) return remembered;

    const past = ConversationStateFold.fold(
      ConversationStateFold.closureOf([...this.operations.values()], parents),
    );

    assert(past.roster, new InvalidConversationOperationError());

    return past.roster.toPrimitives();
  }

  private remember(hash: string, roster: ConversationRoster): void {
    this.states.set(hash, roster.toPrimitives());

    if (this.states.size > ConversationOperationLedger.MAX_REMEMBERED_STATES) {
      this.states.delete(this.states.keys().next().value as string);
    }
  }

  public has(operation: ConversationOperation): boolean {
    return this.operations.has(operation.getHash());
  }

  /** Throws when `candidate` is not permitted in the history it builds on. */
  public admit(candidate: ConversationOperation): void {
    if (this.has(candidate)) return;

    if (!candidate.isGenesis()) this.assertWithinQuota(candidate);

    const roster = candidate.isGenesis()
      ? ConversationOperationApplier.create(candidate)
      : this.applyToPast(candidate);
    const author = candidate.getAuthorIdentityId().valueOf();

    this.operations.set(candidate.getHash(), candidate);
    this.signed.set(author, (this.signed.get(author) ?? 0) + 1);
    this.remember(candidate.getHash(), roster);
  }
}
