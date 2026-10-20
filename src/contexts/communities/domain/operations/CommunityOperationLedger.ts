import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { Community } from '../Community';
import { CommunityInvitation } from '../entities/invitations/CommunityInvitation';
import { CommunityInvitations } from '../entities/invitations/CommunityInvitations';
import { CommunityInvitationNotFoundError } from '../errors/CommunityInvitationNotFoundError';
import { CommunityInvitationUnusableError } from '../errors/CommunityInvitationUnusableError';
import { CommunityOperationParentsMissingError } from '../errors/CommunityOperationParentsMissingError';
import { InvalidCommunityOperationError } from '../errors/InvalidCommunityOperationError';
import { CommunityOperationAction } from '../value-objects/CommunityOperationAction';
import { CommunityPermission } from '../value-objects/CommunityPermission';
import { CommunityAuthorityCuts } from './CommunityAuthorityCuts';
import { CommunityOperation } from './CommunityOperation';
import { CommunityOperationApplier } from './CommunityOperationApplier';
import { CommunityOperationLimits } from './CommunityOperationLimits';
import { CommunityStateFold } from './CommunityStateFold';

type CommunityPast = {
  community: PrimitiveOf<Community>;
  invitations: CommunityInvitations;
};

/**
 * The verified operations of one community. Admitting an operation applies it
 * to the state of its causal past, so a forged operation (an author without
 * the permission at that point of history) is refused and never stored. An
 * operation whose parent has not arrived yet throws
 * `CommunityOperationParentsMissingError` and is stored only once it has.
 *
 * The causal past also decides the invitation rules, which are never judged
 * again: an `invitation_created` reuses no invitation key of its past; an
 * admission uses an invitation of its past that is live there, inside the
 * invitation's window, with valid proofs, once per identity; an
 * `invitation_revoked` closes an open invitation of its past and is signed by
 * its issuer while a member, or by a `manage_members` holder.
 *
 * An author may sign a bounded number of operations of the causal past of
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

  private readonly states = new Map<string, CommunityPast>();

  /** Throws unless an `invitation_created` reuses no key of its past. */
  private static assertIssues(
    candidate: CommunityOperation,
    invitations: CommunityInvitations,
  ): void {
    assert(
      !invitations.findByKey(
        CommunityInvitation.fromOperation(candidate).getInvitationKey(),
      ),
      new InvalidCommunityOperationError(),
    );
  }

  /** Throws unless an admission is valid at its causal past `past`. */
  private static assertAdmits(
    candidate: CommunityOperation,
    past: Community,
    invitation: CommunityInvitation | undefined,
  ): void {
    const { consent, identityId, possession } = candidate.getArguments();

    assert(invitation, new CommunityInvitationNotFoundError());
    assert(
      invitation.isOpenAt(candidate.getCreatedAt()),
      new CommunityInvitationUnusableError(),
    );
    invitation.assertAdmits(
      past,
      new IdentityId(identityId as string),
      possession as string,
      consent as string,
    );
  }

  /**
   * Throws unless an `invitation_revoked` closes an open invitation of its
   * past, signed by the issuer while a member or by a `manage_members`
   * holder.
   */
  private static assertRevokes(
    candidate: CommunityOperation,
    past: Community,
    invitation: CommunityInvitation | undefined,
  ): void {
    const author = candidate.getAuthorIdentityId();

    assert(invitation, new CommunityInvitationNotFoundError());
    assert(
      !invitation.isRevoked() &&
        ((invitation.getIssuerIdentityId().isEqual(author) &&
          past.isMember(author)) ||
          past.holds(author, CommunityPermission.MANAGE_MEMBERS)),
      new InvalidCommunityOperationError(),
    );
  }

  /** Throws unless `candidate` keeps the invitation rules at its past. */
  private static assertInvitationRules(
    candidate: CommunityOperation,
    past: Community,
    invitations: CommunityInvitations,
  ): void {
    const action = candidate.getAction();
    const { invitationId } = candidate.getArguments();
    const invitation = invitations.find(invitationId as string);

    if (action.isEqual(CommunityOperationAction.INVITATION_CREATED)) {
      CommunityOperationLedger.assertIssues(candidate, invitations);
    } else if (action.isEqual(CommunityOperationAction.INVITATION_REVOKED)) {
      CommunityOperationLedger.assertRevokes(candidate, past, invitation);
    } else if (CommunityInvitation.isAdmission(candidate)) {
      CommunityOperationLedger.assertAdmits(candidate, past, invitation);
    }
  }

  /**
   * Only an author with a quota of operations on some branch can have it in
   * the past of a candidate, so the past is walked for those authors alone.
   */
  private assertWithinQuota(candidate: CommunityOperation): void {
    if (
      !CommunityOperationLimits.isAuthorQuotaReached(
        this.signed.get(candidate.getAuthorIdentityId().valueOf()) ?? 0,
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

  /** The state folded from the causal past of `parents`, inclusive. */
  private pastOf(parents: string[]): CommunityPast {
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

    return {
      community: past.community.toPrimitives(),
      invitations: past.invitations,
    };
  }

  /**
   * The state once `candidate` is applied to its causal past; throws when it
   * is not permitted there. Nothing is concurrent with `candidate` in that
   * set, so it stands as a cut and voids nothing: it cuts the invitations
   * whose issuer it takes `create_invites` or membership from.
   */
  private applyToPast(candidate: CommunityOperation): {
    community: Community;
    invitations: CommunityInvitations;
  } {
    const past = this.pastOf(candidate.getParents());
    const before = Community.fromPrimitives(past.community);
    const community = Community.fromPrimitives(past.community);

    assert(
      candidate.getCommunityId().isEqual(community.getId()),
      new InvalidCommunityOperationError(),
    );
    CommunityOperationApplier.apply(community, candidate);
    CommunityOperationLedger.assertInvitationRules(
      candidate,
      before,
      past.invitations,
    );

    const invitations = past.invitations.after(candidate, true);
    const taken = CommunityAuthorityCuts.takenBetween(before, community);

    return {
      community,
      invitations:
        taken.size === 0
          ? invitations
          : invitations.cutWhere((invitation) =>
              CommunityAuthorityCuts.takesInvitesOf(
                taken,
                invitation.getIssuerIdentityId(),
              ),
            ),
    };
  }

  private remember(
    hash: string,
    community: Community,
    invitations: CommunityInvitations,
  ): void {
    // After the last member left nothing can be applied any more.
    if (!community.hasMembers()) return;

    this.states.set(hash, { community: community.toPrimitives(), invitations });

    if (this.states.size > CommunityOperationLedger.MAX_REMEMBERED_STATES) {
      this.states.delete(this.states.keys().next().value as string);
    }
  }

  public has(operation: CommunityOperation): boolean {
    return this.operations.has(operation.getHash());
  }

  /** Throws when `candidate` is not permitted in the history it builds on, or when a parent has not arrived yet. */
  public admit(candidate: CommunityOperation): void {
    if (this.has(candidate)) return;

    if (!candidate.isGenesis()) {
      assert(
        candidate.getParents().every((parent) => this.operations.has(parent)),
        new CommunityOperationParentsMissingError(),
      );
      this.assertWithinQuota(candidate);
    }

    const { community, invitations } = candidate.isGenesis()
      ? {
          community: CommunityOperationApplier.create(candidate),
          invitations: CommunityInvitations.EMPTY,
        }
      : this.applyToPast(candidate);
    const author = candidate.getAuthorIdentityId().valueOf();

    this.operations.set(candidate.getHash(), candidate);
    this.signed.set(author, (this.signed.get(author) ?? 0) + 1);
    this.remember(candidate.getHash(), community, invitations);
  }
}
