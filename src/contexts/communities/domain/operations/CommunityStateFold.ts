import { assert } from '@haskou/value-objects';

import { Community } from '../Community';
import { CommunityInvitation } from '../entities/invitations/CommunityInvitation';
import { CommunityInvitations } from '../entities/invitations/CommunityInvitations';
import { InvalidCommunityOperationError } from '../errors/InvalidCommunityOperationError';
import { CommunityAuthorityCuts } from './CommunityAuthorityCuts';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationAncestry } from './CommunityOperationAncestry';
import { CommunityOperationApplier } from './CommunityOperationApplier';
import { CommunityOperationLimits } from './CommunityOperationLimits';
import { CommunityOperationRebase } from './CommunityOperationRebase';
import { CommunityState } from './CommunityState';

/**
 * Deterministic state of a community: a pure function of the set of verified
 * operations. Operations are applied in a total order (parents first, the
 * lowest digest first among concurrent ones), and each one is authorized again
 * against the state it applies to, so concurrent conflicting operations
 * converge on every node without any wall clock.
 *
 * An operation carrying a whole value (a profile, the roles of a member, ...)
 * that is concurrent with operations ordered before it is rebased on the
 * state it applies to (see `CommunityOperationRebase`), so it changes only
 * what its author changed and concurrent changes to the rest are kept.
 *
 * An identity other than the founder (the genesis author) is responsible for
 * a bounded number of operations per community (see
 * `CommunityOperationLimits.responsibleOf`): the ones ordered after its quota
 * are skipped, whether or not they were permitted.
 *
 * Invitations and admissions are also judged by the authority cuts of the
 * whole set (see `CommunityAuthorityCuts`): a void one is skipped, and an
 * invitation whose issuer a standing cut outside its closure took
 * `create_invites` from is cut for every later admission.
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

  /**
   * Tells, for each operation of `ordered` taken in that order, whether the
   * identity responsible for it still has quota left. The founder, who
   * authors the genesis, has none.
   */
  private static quotaOf(
    ordered: CommunityOperation[],
  ): (operation: CommunityOperation) => boolean {
    const signed = new Map<string, number>();
    const founder = ordered
      .find((operation) => operation.isGenesis())
      ?.getAuthorIdentityId()
      .valueOf();

    return (operation) => {
      const responsible = CommunityOperationLimits.responsibleOf(operation);
      const count = signed.get(responsible) ?? 0;

      signed.set(responsible, count + 1);

      return (
        founder === responsible ||
        !CommunityOperationLimits.isAuthorQuotaReached(count)
      );
    };
  }

  /**
   * Moves the heads of the operations taken so far, applied or skipped, past
   * `operation`; tells whether it is concurrent with any of them.
   */
  private static advance(
    heads: Set<string>,
    operation: CommunityOperation,
  ): boolean {
    const parents = operation.getParents();
    const concurrent =
      parents.length !== heads.size ||
      parents.some((parent) => !heads.has(parent));

    for (const parent of parents) heads.delete(parent);
    heads.add(operation.getHash());

    return concurrent;
  }

  /**
   * The state folded from the causal past of `operation`, remembered in
   * `pasts` per set of parents and shared by the operations built on it.
   */
  private static pastOf(
    ordered: CommunityOperation[],
    operation: CommunityOperation,
    pasts: Map<string, CommunityState>,
  ): CommunityState {
    const parents = operation.getParents();
    const key = [...parents].sort().join(' ');
    let past = pasts.get(key);

    if (!past) {
      past = CommunityStateFold.foldOf(
        CommunityStateFold.closureOf(ordered, parents),
        pasts,
      );
      pasts.set(key, past);
    }

    return past;
  }

  /**
   * The community the author of a concurrent whole value saw when signing it
   * on top of its parents; none for any other operation, which is built on
   * the state it applies to or has nothing concurrent to keep.
   */
  private static baseOf(
    ordered: CommunityOperation[],
    operation: CommunityOperation,
    concurrent: boolean,
    pasts: Map<string, CommunityState>,
  ): Community | undefined {
    return concurrent && CommunityOperationRebase.rebases(operation)
      ? CommunityStateFold.pastOf(ordered, operation, pasts).community
      : undefined;
  }

  /**
   * Whether `operation` is void by the authority cuts: an invitation or an
   * admission a standing cut reaches, or an admission under a void
   * invitation.
   */
  private static isVoid(
    operation: CommunityOperation,
    cuts: CommunityAuthorityCuts,
    byHash: Map<string, CommunityOperation>,
  ): boolean {
    if (cuts.isVoid(operation)) return true;

    const { invitationId } = operation.getArguments();
    const invitation =
      CommunityInvitation.isAdmission(operation) &&
      typeof invitationId === 'string'
        ? byHash.get(invitationId)
        : undefined;

    return !!invitation && cuts.isVoid(invitation);
  }

  /** `community` after `operation`; throws when it is not permitted. */
  private static next(
    community: Community | undefined,
    operation: CommunityOperation,
    base: Community | undefined,
  ): Community {
    if (operation.isGenesis()) {
      assert(!community, new InvalidCommunityOperationError());

      return CommunityOperationApplier.create(operation);
    }

    assert(community, new InvalidCommunityOperationError());
    assert(
      operation.getCommunityId().isEqual(community.getId()),
      new InvalidCommunityOperationError(),
    );
    // A failed operation must not leave a half applied state behind.
    const candidate = Community.fromPrimitives(community.toPrimitives());

    CommunityOperationApplier.apply(candidate, operation, base);

    return candidate;
  }

  private static foldOf(
    operations: CommunityOperation[],
    pasts: Map<string, CommunityState>,
  ): CommunityState {
    const ordered = CommunityStateFold.orderOf(operations);
    const byHash = new Map(
      ordered.map((operation) => [operation.getHash(), operation]),
    );
    const cuts = new CommunityAuthorityCuts(
      ordered,
      new CommunityOperationAncestry(ordered),
      (operation) =>
        CommunityAuthorityCuts.takenBy(
          CommunityStateFold.pastOf(ordered, operation, pasts).community,
          operation,
        ),
    );
    const skipped: string[] = [];
    const withinQuota = CommunityStateFold.quotaOf(ordered);
    const heads = new Set<string>();
    let community: Community | undefined;
    let invitations = CommunityInvitations.EMPTY;
    let deleted = false;

    for (const operation of ordered) {
      const concurrent = CommunityStateFold.advance(heads, operation);
      let applied = false;

      if (
        withinQuota(operation) &&
        !deleted &&
        !CommunityStateFold.isVoid(operation, cuts, byHash)
      ) {
        try {
          community = CommunityStateFold.next(
            community,
            operation,
            CommunityStateFold.baseOf(ordered, operation, concurrent, pasts),
          );
          community.pullDomainEvents();
          deleted = !community.hasMembers();
          applied = true;
        } catch {
          applied = false;
        }
      }

      if (!applied) skipped.push(operation.getHash());

      invitations = invitations.after(operation, applied);
    }

    return {
      community,
      deleted,
      frontier: CommunityStateFold.frontierOf(ordered),
      invitations: invitations.cutWhere((invitation) =>
        cuts.cutsIssuerOf(invitation),
      ),
      skipped,
    };
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
    return CommunityStateFold.foldOf(operations, new Map());
  }
}
