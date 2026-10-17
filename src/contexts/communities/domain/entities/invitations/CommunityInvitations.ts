import { CommunityOperation } from '../../operations/CommunityOperation';
import { CommunityOperationAction } from '../../value-objects/CommunityOperationAction';
import { CommunityInvitation } from './CommunityInvitation';

/**
 * The invitations of one set of community operations, by id and by key.
 * Immutable: each change returns a new collection and leaves the invitations
 * it does not touch shared.
 */
export class CommunityInvitations {
  public static readonly EMPTY = new CommunityInvitations(new Map(), new Map());

  private constructor(
    private readonly invitations: ReadonlyMap<string, CommunityInvitation>,
    /** The first invitation issued with each key, so a preview never scans. */
    private readonly idsByKey: ReadonlyMap<string, string>,
  ) {}

  private with(invitation: CommunityInvitation): CommunityInvitations {
    const key = invitation.getInvitationKey();

    return new CommunityInvitations(
      new Map(this.invitations).set(invitation.getId(), invitation),
      this.idsByKey.has(key)
        ? this.idsByKey
        : new Map(this.idsByKey).set(key, invitation.getId()),
    );
  }

  /** The known invitation `operation` names, if any. */
  private invitationOf(
    operation: CommunityOperation,
  ): CommunityInvitation | undefined {
    const { invitationId } = operation.getArguments();

    return typeof invitationId === 'string'
      ? this.invitations.get(invitationId)
      : undefined;
  }

  public find(id: string): CommunityInvitation | undefined {
    return this.invitations.get(id);
  }

  public findByKey(invitationKey: string): CommunityInvitation | undefined {
    const id = this.idsByKey.get(invitationKey);

    return id === undefined ? undefined : this.invitations.get(id);
  }

  public list(): CommunityInvitation[] {
    return [...this.invitations.values()];
  }

  /**
   * The invitations once `operation` is taken, `applied` or not: an applied
   * `invitation_created` issues an invitation and an applied
   * `invitation_revoked` closes one. Every admission counts as a use of an
   * invitation known here, even one the fold skips or voids: the ledger
   * stored it because it was valid at its own causal past.
   */
  public after(
    operation: CommunityOperation,
    applied: boolean,
  ): CommunityInvitations {
    const action = operation.getAction();
    const { identityId } = operation.getArguments();

    if (
      applied &&
      action.isEqual(CommunityOperationAction.INVITATION_CREATED)
    ) {
      return this.with(CommunityInvitation.fromOperation(operation));
    }

    const invitation = this.invitationOf(operation);

    if (!invitation) return this;

    if (
      applied &&
      action.isEqual(CommunityOperationAction.INVITATION_REVOKED)
    ) {
      return this.with(invitation.revoked());
    }

    return CommunityInvitation.isAdmission(operation) &&
      typeof identityId === 'string'
      ? this.with(invitation.withJoiner(identityId))
      : this;
  }

  /** Marks as cut every invitation `isCut` tells. */
  public cutWhere(
    isCut: (invitation: CommunityInvitation) => boolean,
  ): CommunityInvitations {
    return new CommunityInvitations(
      new Map(
        [...this.invitations].map(([id, invitation]) => [
          id,
          isCut(invitation) ? invitation.cut() : invitation,
        ]),
      ),
      this.idsByKey,
    );
  }
}
