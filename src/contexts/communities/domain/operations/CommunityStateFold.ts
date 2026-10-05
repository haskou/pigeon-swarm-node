import { assert } from '@haskou/value-objects';

import { Community } from '../Community';
import { InvalidCommunityOperationError } from '../errors/InvalidCommunityOperationError';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationApplier } from './CommunityOperationApplier';
import { CommunityState } from './CommunityState';

/**
 * Deterministic state of a community: a pure function of the set of verified
 * operations. Operations are applied in a total order (parents first, the
 * lowest digest first among concurrent ones), and each one is authorized again
 * against the state it applies to, so concurrent conflicting operations
 * converge on every node without any wall clock.
 */
export class CommunityStateFold {
  /** Operations whose parents are all known, deduplicated by digest. */
  private static resolvable(
    operations: CommunityOperation[],
  ): Map<string, CommunityOperation> {
    const known = new Map(
      operations.map((operation) => [operation.getHash(), operation]),
    );
    const resolvable = new Map<string, CommunityOperation>();
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

  /** Parents first; the lowest digest first among the ready operations. */
  public static orderOf(
    operations: CommunityOperation[],
  ): CommunityOperation[] {
    const pending = CommunityStateFold.resolvable(operations);
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
    const ordered: CommunityOperation[] = [];

    while (ready.length > 0) {
      const hash = ready.shift() as string;

      ordered.push(pending.get(hash) as CommunityOperation);

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
    operations: CommunityOperation[],
    parents: string[],
  ): CommunityOperation[] {
    const known = new Map(
      operations.map((operation) => [operation.getHash(), operation]),
    );
    const closure = new Map<string, CommunityOperation>();
    const stack = [...parents];

    while (stack.length > 0) {
      const hash = stack.pop() as string;
      const operation = known.get(hash);

      assert(operation, new InvalidCommunityOperationError());

      if (!closure.has(hash)) {
        closure.set(hash, operation);
        stack.push(...operation.getParents());
      }
    }

    return [...closure.values()];
  }

  public static frontierOf(operations: CommunityOperation[]): string[] {
    const referenced = new Set(
      operations.flatMap((operation) => operation.getParents()),
    );

    return operations
      .map((operation) => operation.getHash())
      .filter((hash) => !referenced.has(hash))
      .sort();
  }

  /** Folds every operation of one community into its current state. */
  public static fold(operations: CommunityOperation[]): CommunityState {
    const ordered = CommunityStateFold.orderOf(operations);
    const skipped: string[] = [];
    let community: Community | undefined;
    let deleted = false;

    for (const operation of ordered) {
      if (deleted) {
        skipped.push(operation.getHash());
        continue;
      }

      try {
        if (operation.isGenesis()) {
          assert(!community, new InvalidCommunityOperationError());
          community = CommunityOperationApplier.create(operation);
        } else {
          assert(community, new InvalidCommunityOperationError());
          assert(
            operation.getCommunityId().isEqual(community.getId()),
            new InvalidCommunityOperationError(),
          );
          // A failed operation must not leave a half applied state behind.
          const candidate = Community.fromPrimitives(community.toPrimitives());

          CommunityOperationApplier.apply(candidate, operation);
          community = candidate;
        }

        community.pullDomainEvents();
        deleted = !community.hasMembers();
      } catch {
        skipped.push(operation.getHash());
      }
    }

    return {
      community,
      deleted,
      frontier: CommunityStateFold.frontierOf([...operations]),
      skipped,
    };
  }

  /**
   * Applies `candidate` to the state of its causal past and returns the
   * resulting community. Throws when the author is not permitted there, which
   * is how a forged operation is refused before it is stored.
   */
  public static authorize(
    known: CommunityOperation[],
    candidate: CommunityOperation,
  ): Community {
    const past = CommunityStateFold.fold(
      CommunityStateFold.closureOf(known, candidate.getParents()),
    );

    if (candidate.isGenesis()) {
      assert(known.length === 0, new InvalidCommunityOperationError());

      return CommunityOperationApplier.create(candidate);
    }

    assert(
      past.community && !past.deleted,
      new InvalidCommunityOperationError(),
    );

    const community = Community.fromPrimitives(past.community.toPrimitives());

    CommunityOperationApplier.apply(community, candidate);

    return community;
  }
}
