import { assert } from '@haskou/value-objects';

import { InvalidConversationOperationError } from '../errors/InvalidConversationOperationError';
import { ConversationOperation } from './ConversationOperation';
import { ConversationOperationApplier } from './ConversationOperationApplier';
import { ConversationOperationLimits } from './ConversationOperationLimits';
import { ConversationRoster } from './ConversationRoster';
import { ConversationState } from './ConversationState';

/**
 * Deterministic roster of a conversation: a pure function of the set of
 * verified operations. Operations are applied in a total order (parents first,
 * the lowest digest first among concurrent ones), and each one is authorized
 * again against the roster it applies to, so concurrent conflicting operations
 * converge on every node without any wall clock.
 *
 * An identity other than the creator (the genesis author) signs a bounded
 * number of operations per conversation: the ones ordered after its quota are
 * skipped, whether or not they were permitted.
 */
export class ConversationStateFold {
  /** Operations whose parents are all known, deduplicated by digest. */
  private static resolvable(
    operations: ConversationOperation[],
  ): Map<string, ConversationOperation> {
    const known = new Map(
      operations.map((operation) => [operation.getHash(), operation]),
    );
    const resolvable = new Map<string, ConversationOperation>();
    let progressed = true;

    while (progressed) {
      progressed = false;

      for (const [hash, operation] of known) {
        if (
          !resolvable.has(hash) &&
          operation.getParents().every((parent) => resolvable.has(parent))
        ) {
          resolvable.set(hash, operation);
          progressed = true;
        }
      }
    }

    return resolvable;
  }

  /**
   * Tells, for each operation of `ordered` taken in that order, whether its
   * author still has quota left. The creator, who authors the genesis, has
   * none.
   */
  private static quotaOf(
    ordered: ConversationOperation[],
  ): (operation: ConversationOperation) => boolean {
    const signed = new Map<string, number>();
    const creator = ordered
      .find((operation) => operation.isGenesis())
      ?.getAuthorIdentityId();

    return (operation) => {
      const author = operation.getAuthorIdentityId();
      const count = signed.get(author.valueOf()) ?? 0;

      signed.set(author.valueOf(), count + 1);

      return (
        !!creator?.isEqual(author) ||
        !ConversationOperationLimits.isAuthorQuotaReached(count)
      );
    };
  }

  /** Parents first; the lowest digest first among the ready operations. */
  public static orderOf(
    operations: ConversationOperation[],
  ): ConversationOperation[] {
    const pending = ConversationStateFold.resolvable(operations);
    const waiting = new Map(
      [...pending].map(([hash, operation]) => [
        hash,
        new Set(operation.getParents()),
      ]),
    );
    const children = new Map<string, string[]>();

    for (const [hash, operation] of pending) {
      for (const parent of operation.getParents()) {
        children.set(parent, [...(children.get(parent) ?? []), hash]);
      }
    }

    const ready = [...waiting]
      .filter(([, parents]) => parents.size === 0)
      .map(([hash]) => hash)
      .sort();
    const ordered: ConversationOperation[] = [];

    while (ready.length > 0) {
      const hash = ready.shift() as string;

      ordered.push(pending.get(hash) as ConversationOperation);

      for (const child of children.get(hash) ?? []) {
        const parents = waiting.get(child) as Set<string>;

        parents.delete(hash);

        if (parents.size === 0) {
          ready.push(child);
        }
      }

      ready.sort();
    }

    return ordered;
  }

  /** Operations in the causal past of `parents`, inclusive. */
  public static closureOf(
    operations: ConversationOperation[],
    parents: string[],
  ): ConversationOperation[] {
    const known = new Map(
      operations.map((operation) => [operation.getHash(), operation]),
    );
    const closure = new Map<string, ConversationOperation>();
    const stack = [...parents];

    while (stack.length > 0) {
      const hash = stack.pop() as string;
      const operation = known.get(hash);

      assert(operation, new InvalidConversationOperationError());

      if (!closure.has(hash)) {
        closure.set(hash, operation);
        stack.push(...operation.getParents());
      }
    }

    return [...closure.values()];
  }

  public static frontierOf(operations: ConversationOperation[]): string[] {
    const referenced = new Set(
      operations.flatMap((operation) => operation.getParents()),
    );

    return operations
      .map((operation) => operation.getHash())
      .filter((hash) => !referenced.has(hash))
      .sort();
  }

  /** Folds every operation of one conversation into its current roster. */
  public static fold(operations: ConversationOperation[]): ConversationState {
    const ordered = ConversationStateFold.orderOf(operations);
    const skipped: string[] = [];
    const withinQuota = ConversationStateFold.quotaOf(ordered);
    let roster: ConversationRoster | undefined;

    for (const operation of ordered) {
      if (!withinQuota(operation)) {
        skipped.push(operation.getHash());
        continue;
      }

      try {
        if (operation.isGenesis()) {
          assert(!roster, new InvalidConversationOperationError());
          roster = ConversationOperationApplier.create(operation);
        } else {
          assert(roster, new InvalidConversationOperationError());
          // A failed operation must not leave a half applied roster behind.
          const candidate = ConversationRoster.fromPrimitives(
            roster.toPrimitives(),
          );

          ConversationOperationApplier.apply(candidate, operation);
          roster = candidate;
        }
      } catch {
        skipped.push(operation.getHash());
      }
    }

    return {
      frontier: ConversationStateFold.frontierOf(ordered),
      roster,
      skipped,
    };
  }

  /**
   * The roster `candidate` produces when applied to the causal past of its
   * parents, or an error when its author may not perform it there. A parent
   * nobody knows, or a past without a genesis, is refused.
   */
  public static rosterAfter(
    operations: ConversationOperation[],
    candidate: ConversationOperation,
  ): ConversationRoster {
    assert(!candidate.isGenesis(), new InvalidConversationOperationError());

    const { roster } = ConversationStateFold.fold(
      ConversationStateFold.closureOf(operations, candidate.getParents()),
    );

    assert(roster, new InvalidConversationOperationError());

    const next = ConversationRoster.fromPrimitives(roster.toPrimitives());

    ConversationOperationApplier.apply(next, candidate);

    return next;
  }
}
