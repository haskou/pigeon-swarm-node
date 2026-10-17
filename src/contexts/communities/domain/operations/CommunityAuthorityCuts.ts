import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../Community';
import { CommunityInvitation } from '../entities/invitations/CommunityInvitation';
import { CommunityOperationAction } from '../value-objects/CommunityOperationAction';
import { CommunityPermission } from '../value-objects/CommunityPermission';
import { CommunityCutComponents } from './CommunityCutComponents';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationAncestry } from './CommunityOperationAncestry';
import { CommunityOperationApplier } from './CommunityOperationApplier';

/** What one cut takes: `<authority> <identityId>` for each authority lost. */
export type CommunityAuthorityTaken = ReadonlySet<string>;

/**
 * The authority cuts (#543) of one set of operations `S`.
 *
 * An operation `D` **cuts** an authority of member `X` (its membership, or a
 * permission some operation needs) when `X` holds it in `past(D)`, the
 * community folded from the causal past of `D`, and does not once `D` is
 * applied there. Only kicks, bans, leaves and role changes cut; what they
 * take is decided from `D` and its causal past alone (`takenBy`).
 *
 * The cuts form a graph with an edge from `D` to `E` when they are concurrent
 * and `D` takes what `E` needs of its author. Its strongly connected
 * components are visited in topological order: a cut is void when a standing
 * cut of an earlier component reaches it and takes what it needs, and stands
 * otherwise. Cuts of one component never void each other.
 *
 * A standing cut reaches the operations it is concurrent with. A cut of a
 * cycle (a component of more than one cut) never reaches what its author
 * built on: an operation in the closure of one its author signed without the
 * cut in its closure.
 *
 * A void cut takes nothing here, but the linear fold still applies it. Only
 * invitations and admissions are ever void (`isVoid`). The founder holds
 * every authority by ownership, so nothing cuts it.
 */
export class CommunityAuthorityCuts {
  private static readonly MEMBERSHIP = 'membership';

  /** What each cutting action needs of its author. */
  private static readonly CUT_NEEDS: Record<string, string> = {
    [CommunityOperationAction.MEMBER_BANNED.valueOf()]:
      CommunityPermission.BAN_MEMBERS.valueOf(),
    [CommunityOperationAction.MEMBER_KICKED.valueOf()]:
      CommunityPermission.MANAGE_MEMBERS.valueOf(),
    [CommunityOperationAction.MEMBER_LEFT.valueOf()]:
      CommunityAuthorityCuts.MEMBERSHIP,
    [CommunityOperationAction.MEMBER_ROLES_UPDATED.valueOf()]:
      CommunityPermission.MANAGE_ROLES.valueOf(),
    [CommunityOperationAction.ROLE_DELETED.valueOf()]:
      CommunityPermission.MANAGE_ROLES.valueOf(),
    [CommunityOperationAction.ROLE_UPDATED.valueOf()]:
      CommunityPermission.MANAGE_ROLES.valueOf(),
  };

  /** The permissions some cut, invitation or admission needs. */
  private static readonly PERMISSIONS = [
    CommunityPermission.BAN_MEMBERS,
    CommunityPermission.CREATE_INVITES,
    CommunityPermission.MANAGE_MEMBERS,
    CommunityPermission.MANAGE_ROLES,
  ];

  private static readonly NOTHING: CommunityAuthorityTaken = new Set();

  private readonly authored = new Map<string, CommunityOperation[]>();

  /** What each cut of `S` takes, for the cuts that take something. */
  private readonly taken = new Map<string, CommunityAuthorityTaken>();

  /** The cuts of `S` by each identity they take something from. */
  private readonly cutsOf = new Map<string, CommunityOperation[]>();

  private readonly cyclic = new Set<string>();

  private readonly standing = new Set<string>();

  private readonly spared = new Map<string, Set<string>>();

  private static keyOf(authority: string, identityId: string): string {
    return `${authority} ${identityId}`;
  }

  private static isCutting(operation: CommunityOperation): boolean {
    return Object.hasOwn(
      CommunityAuthorityCuts.CUT_NEEDS,
      operation.getAction().valueOf(),
    );
  }

  /** What `operation` needs of its author, when a cut can void it. */
  private static needOf(operation: CommunityOperation): string | undefined {
    const action = operation.getAction().valueOf();

    if (CommunityAuthorityCuts.isCutting(operation)) {
      return CommunityAuthorityCuts.CUT_NEEDS[action];
    }

    if (action === CommunityOperationAction.INVITATION_CREATED.valueOf()) {
      return CommunityPermission.CREATE_INVITES.valueOf();
    }

    return CommunityInvitation.isAdmission(operation)
      ? CommunityPermission.MANAGE_MEMBERS.valueOf()
      : undefined;
  }

  /**
   * What `operation` takes when applied to `past`, the community folded from
   * its causal past; nothing for an operation that cuts nothing or that
   * `past` does not permit.
   */
  public static takenBy(
    past: Community | undefined,
    operation: CommunityOperation,
  ): CommunityAuthorityTaken {
    if (!past || !CommunityAuthorityCuts.isCutting(operation)) {
      return CommunityAuthorityCuts.NOTHING;
    }

    const after = Community.fromPrimitives(past.toPrimitives());

    try {
      CommunityOperationApplier.apply(after, operation);
    } catch {
      return CommunityAuthorityCuts.NOTHING;
    }

    return CommunityAuthorityCuts.takenBetween(past, after);
  }

  /** What the members of `before` lost in `after`. */
  public static takenBetween(
    before: Community,
    after: Community,
  ): CommunityAuthorityTaken {
    const taken = new Set<string>();

    for (const member of before.getMemberIds()) {
      if (!after.isMember(member)) {
        taken.add(
          CommunityAuthorityCuts.keyOf(
            CommunityAuthorityCuts.MEMBERSHIP,
            member.valueOf(),
          ),
        );
      }

      for (const permission of CommunityAuthorityCuts.PERMISSIONS) {
        if (
          before.holds(member, permission) &&
          !after.holds(member, permission)
        ) {
          taken.add(
            CommunityAuthorityCuts.keyOf(
              permission.valueOf(),
              member.valueOf(),
            ),
          );
        }
      }
    }

    return taken;
  }

  /** Whether `taken` holds `create_invites` or the membership of `issuer`. */
  public static takesInvitesOf(
    taken: CommunityAuthorityTaken,
    issuer: IdentityId,
  ): boolean {
    return (
      taken.has(
        CommunityAuthorityCuts.keyOf(
          CommunityPermission.CREATE_INVITES.valueOf(),
          issuer.valueOf(),
        ),
      ) ||
      taken.has(
        CommunityAuthorityCuts.keyOf(
          CommunityAuthorityCuts.MEMBERSHIP,
          issuer.valueOf(),
        ),
      )
    );
  }

  /**
   * `ordered` is `S` with parents first; `takenOf` tells what a cutting
   * operation of `S` takes at its causal past.
   */
  public constructor(
    ordered: CommunityOperation[],
    private readonly ancestry: CommunityOperationAncestry,
    takenOf: (operation: CommunityOperation) => CommunityAuthorityTaken,
  ) {
    for (const operation of ordered) {
      const author = operation.getAuthorIdentityId().valueOf();

      this.authored.set(author, [
        ...(this.authored.get(author) ?? []),
        operation,
      ]);
    }

    for (const operation of ordered) {
      if (!this.matters(operation)) continue;

      const taken = takenOf(operation);

      if (taken.size === 0) continue;

      this.taken.set(operation.getHash(), taken);

      for (const member of new Set(
        [...taken].map((key) => key.slice(key.indexOf(' ') + 1)),
      )) {
        this.cutsOf.set(member, [
          ...(this.cutsOf.get(member) ?? []),
          operation,
        ]);
      }
    }

    this.decide(
      ordered.filter((operation) => this.taken.has(operation.getHash())),
    );
  }

  /**
   * Whether what a cutting `operation` takes can change anything in `S`:
   * some operation of a member it may cut needs an authority and is either
   * concurrent with it or an invitation it is not in the closure of. A role
   * change may cut any member, so it always matters.
   */
  private matters(operation: CommunityOperation): boolean {
    const action = operation.getAction();

    if (!CommunityAuthorityCuts.isCutting(operation)) return false;

    if (
      action.isEqual(CommunityOperationAction.ROLE_UPDATED) ||
      action.isEqual(CommunityOperationAction.ROLE_DELETED)
    ) {
      return true;
    }

    const { identityId } = operation.getArguments();
    const target = action.isEqual(CommunityOperationAction.MEMBER_LEFT)
      ? operation.getAuthorIdentityId().valueOf()
      : identityId;
    const hash = operation.getHash();

    return (
      typeof target === 'string' &&
      (this.authored.get(target) ?? []).some(
        (other) =>
          CommunityAuthorityCuts.needOf(other) !== undefined &&
          (this.ancestry.areConcurrent(hash, other.getHash()) ||
            (other
              .getAction()
              .isEqual(CommunityOperationAction.INVITATION_CREATED) &&
              !this.ancestry.isAncestor(hash, other.getHash()))),
      )
    );
  }

  /** Whether `cut` took `authority` of `identityId`. */
  private takes(
    cut: CommunityOperation,
    authority: string,
    identityId: string,
  ): boolean {
    return !!this.taken
      .get(cut.getHash())
      ?.has(CommunityAuthorityCuts.keyOf(authority, identityId));
  }

  /** The operations in the closure of one `cut`'s author signed without it. */
  private sparedBy(cut: CommunityOperation): Set<string> {
    const hash = cut.getHash();
    let spared = this.spared.get(hash);

    if (!spared) {
      spared = this.ancestry.closureOf(
        (this.authored.get(cut.getAuthorIdentityId().valueOf()) ?? [])
          .map((operation) => operation.getHash())
          .filter(
            (signed) =>
              signed !== hash && !this.ancestry.isAncestor(hash, signed),
          ),
      );
      this.spared.set(hash, spared);
    }

    return spared;
  }

  private reaches(
    cut: CommunityOperation,
    operation: CommunityOperation,
  ): boolean {
    return (
      this.ancestry.areConcurrent(cut.getHash(), operation.getHash()) &&
      (!this.cyclic.has(cut.getHash()) ||
        !this.sparedBy(cut).has(operation.getHash()))
    );
  }

  /** Whether a standing cut reaches `operation` and takes `need` of its author. */
  private isReachedBy(operation: CommunityOperation, need: string): boolean {
    const author = operation.getAuthorIdentityId().valueOf();

    return (this.cutsOf.get(author) ?? []).some(
      (cut) =>
        this.standing.has(cut.getHash()) &&
        this.takes(cut, need, author) &&
        this.reaches(cut, operation),
    );
  }

  /** The concurrent cuts that take what `cut` needs of its author. */
  private predecessorsOf(cut: CommunityOperation): CommunityOperation[] {
    const author = cut.getAuthorIdentityId().valueOf();
    const need = CommunityAuthorityCuts.needOf(cut) as string;

    return (this.cutsOf.get(author) ?? []).filter(
      (other) =>
        other !== cut &&
        this.takes(other, need, author) &&
        this.ancestry.areConcurrent(other.getHash(), cut.getHash()),
    );
  }

  /**
   * The cuts of one `component` stand unless a standing cut of an earlier
   * component reaches them and takes what they need.
   */
  private decideComponent(
    component: string[],
    byHash: ReadonlyMap<string, CommunityOperation>,
    predecessors: ReadonlyMap<string, CommunityOperation[]>,
  ): void {
    const members = new Set(component);

    if (component.length > 1) {
      component.forEach((hash) => this.cyclic.add(hash));
    }

    for (const hash of component) {
      const cut = byHash.get(hash) as CommunityOperation;
      const voided = (predecessors.get(hash) ?? []).some(
        (other) =>
          !members.has(other.getHash()) &&
          this.standing.has(other.getHash()) &&
          this.reaches(other, cut),
      );

      if (!voided) this.standing.add(hash);
    }
  }

  /** Builds the cut graph of `cuts` and decides which cuts stand. */
  private decide(cuts: CommunityOperation[]): void {
    const byHash = new Map(cuts.map((cut) => [cut.getHash(), cut]));
    const predecessors = new Map(
      cuts.map((cut) => [cut.getHash(), this.predecessorsOf(cut)]),
    );
    const successors = new Map<string, string[]>();

    for (const [hash, incoming] of predecessors) {
      for (const other of incoming) {
        successors.set(other.getHash(), [
          ...(successors.get(other.getHash()) ?? []),
          hash,
        ]);
      }
    }

    for (const component of CommunityCutComponents.of(
      [...byHash.keys()],
      successors,
    )) {
      this.decideComponent(component, byHash, predecessors);
    }
  }

  /**
   * Whether an invitation or an admission is void in `S`: a standing cut
   * reaches it and takes `create_invites` of the issuer or `manage_members`
   * of the admitter. Nothing else is ever void.
   */
  public isVoid(operation: CommunityOperation): boolean {
    const need = CommunityAuthorityCuts.isCutting(operation)
      ? undefined
      : CommunityAuthorityCuts.needOf(operation);

    return need !== undefined && this.isReachedBy(operation, need);
  }

  /**
   * Whether a standing cut outside the closure of `invitation` took
   * `create_invites` or the membership of its issuer: the invitation is dead
   * for every later admission, even after the issuer is promoted again.
   */
  public cutsIssuerOf(invitation: CommunityInvitation): boolean {
    const issuer = invitation.getIssuerIdentityId();

    return (this.cutsOf.get(issuer.valueOf()) ?? []).some(
      (cut) =>
        this.standing.has(cut.getHash()) &&
        CommunityAuthorityCuts.takesInvitesOf(
          this.taken.get(cut.getHash()) as CommunityAuthorityTaken,
          issuer,
        ) &&
        !this.ancestry.isAncestor(cut.getHash(), invitation.getId()),
    );
  }
}
