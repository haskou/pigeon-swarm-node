import { CommunityInvitationNotFoundError } from '@app/contexts/communities/domain/errors/CommunityInvitationNotFoundError';
import { CommunityInvitationUnusableError } from '@app/contexts/communities/domain/errors/CommunityInvitationUnusableError';
import { InvalidCommunityOperationError } from '@app/contexts/communities/domain/errors/InvalidCommunityOperationError';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationLedger } from '@app/contexts/communities/domain/operations/CommunityOperationLedger';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';

import {
  admission,
  alice,
  assignRoles,
  ban,
  bob,
  carol,
  communityId,
  DAY,
  genesis,
  invitation,
  join,
  kick,
  leave,
  mallory,
  operation,
  owner,
  revoke,
  role,
} from './CommunityOperationFixtures';

describe('CommunityOperationLedger', () => {
  it('admits operations in the history they build on', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const joined = join([created], alice);

    expect(() => {
      ledger.admit(created);
      ledger.admit(joined);
      ledger.admit(ban([joined], alice));
    }).not.toThrow();
  });

  it('refuses a forged operation against its causal past', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();

    ledger.admit(created);

    expect(() => ledger.admit(ban([created], owner, mallory))).toThrow();
    expect(() => ledger.admit(join([created], mallory, mallory))).toThrow();
  });

  it('refuses an operation whose parents are unknown', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const orphan = join([join([created], alice)], mallory);

    ledger.admit(created);

    expect(() => ledger.admit(orphan)).toThrow();
  });

  it('admits an operation after its missing parent arrives', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const joined = join([created], alice);
    const next = join([joined], mallory);

    ledger.admit(created);
    expect(() => ledger.admit(next)).toThrow();

    ledger.admit(joined);

    expect(() => ledger.admit(next)).not.toThrow();
  });

  it('authorizes an operation against the merged history of several parents', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const joinedAlice = join([created], alice);
    const joinedMallory = join([created], mallory);
    const merged = ban([joinedAlice, joinedMallory], mallory);

    [created, joinedAlice, joinedMallory].forEach((operation) =>
      ledger.admit(operation),
    );

    expect(() => ledger.admit(merged)).not.toThrow();
  });

  it('refuses everything after the last member left', () => {
    const ledger = new CommunityOperationLedger();
    const created = genesis();
    const left = operation(
      CommunityOperationAction.MEMBER_LEFT,
      owner,
      { identityId: owner.valueOf() },
      [created],
    );

    ledger.admit(created);
    ledger.admit(left);

    expect(() => ledger.admit(join([left], alice))).toThrow();
  });

  describe('demotion racing a moderation action across a partition', () => {
    const created = genesis();
    const joinedAlice = join([created], alice);
    const joinedMallory = join([joinedAlice], mallory);
    const roleId = CommunityRoleId.derive(
      communityId.valueOf(),
      owner.valueOf(),
      3,
    ).valueOf();
    const moderator = operation(
      CommunityOperationAction.ROLE_CREATED,
      owner,
      { name: 'moderator', permissions: ['ban_members'], roleId },
      [joinedMallory],
      3,
    );
    const promote = operation(
      CommunityOperationAction.MEMBER_ROLES_UPDATED,
      owner,
      { identityId: alice.valueOf(), roleIds: [roleId] },
      [moderator],
    );
    const demote = operation(
      CommunityOperationAction.MEMBER_ROLES_UPDATED,
      owner,
      { identityId: alice.valueOf(), roleIds: [] },
      [promote],
    );
    const history = [created, joinedAlice, joinedMallory, moderator, promote];

    it('still admits, whichever side arrives first, a ban authored while the moderator was one', () => {
      const banWhileModerator = ban([promote], mallory, alice);

      for (const arrival of [
        [demote, banWhileModerator],
        [banWhileModerator, demote],
      ]) {
        const ledger = new CommunityOperationLedger();

        history.forEach((entry) => ledger.admit(entry));

        expect(() =>
          arrival.forEach((entry) => ledger.admit(entry)),
        ).not.toThrow();
      }
    });

    it('refuses a ban that builds on the demotion', () => {
      const ledger = new CommunityOperationLedger();

      [...history, demote].forEach((entry) => ledger.admit(entry));

      expect(() => ledger.admit(ban([demote], mallory, alice))).toThrow();
    });
  });

  describe('invitations', () => {
    const created = genesis();
    const managers = role([created], ['create_invites', 'manage_members'], 2);
    const malloryJoins = join([managers], mallory);
    const carolJoins = join([malloryJoins], carol);
    const base = assignRoles([carolJoins], mallory, [managers], owner, 3);
    const history = [created, managers, malloryJoins, carolJoins, base];

    function ledgerOf(...operations: CommunityOperation[]) {
      const ledger = new CommunityOperationLedger();

      [...history, ...operations].forEach((entry) => ledger.admit(entry));

      return ledger;
    }

    it('admits an invitation, its admissions, a later join and its revocation', () => {
      const invited = invitation([base], mallory, {}, 10);
      const admitted = admission(
        [invited.operation],
        invited,
        alice,
        owner,
        11,
      );
      const second = admission([admitted], invited, bob, mallory, 12);

      expect(() =>
        ledgerOf(
          invited.operation,
          admitted,
          second,
          revoke([second], invited, mallory),
        ),
      ).not.toThrow();
    });

    it('admits concurrent admissions and the operation merging them', () => {
      const invited = invitation([base], owner, {}, 10);
      const byOwner = admission([invited.operation], invited, alice, owner, 11);
      const byMallory = admission(
        [invited.operation],
        invited,
        bob,
        mallory,
        11,
      );

      expect(() =>
        ledgerOf(
          invited.operation,
          byOwner,
          byMallory,
          kick([byOwner, byMallory], alice, owner, 12),
        ),
      ).not.toThrow();
    });

    it('refuses an invitation reusing a key of its past, even a revoked one', () => {
      const invited = invitation([base], owner, {}, 10, 'shared');
      const revoked = revoke([invited.operation], invited);
      const ledger = ledgerOf(invited.operation, revoked);

      expect(() =>
        ledger.admit(
          invitation([revoked], mallory, {}, 11, 'shared').operation,
        ),
      ).toThrow(InvalidCommunityOperationError);
    });

    it('refuses an invitation by an issuer without create_invites or by a stranger', () => {
      const ledger = ledgerOf();

      expect(() =>
        ledger.admit(invitation([base], carol, {}, 10).operation),
      ).toThrow();
      expect(() =>
        ledger.admit(invitation([base], alice, {}, 10).operation),
      ).toThrow();
    });

    it('refuses an admission by an admitter without manage_members', () => {
      const invited = invitation([base], owner, {}, 10);
      const ledger = ledgerOf(invited.operation);

      expect(() =>
        ledger.admit(admission([invited.operation], invited, alice, carol, 11)),
      ).toThrow();
    });

    it('refuses an admission under an invitation outside its causal past', () => {
      const invited = invitation([base], owner, {}, 10);
      const ledger = ledgerOf(invited.operation);

      expect(() =>
        ledger.admit(admission([base], invited, alice, owner, 11)),
      ).toThrow(CommunityInvitationNotFoundError);
    });

    it.each([
      ['before the invitation was created', 9],
      ['after it expired', 10 + 7 * DAY + 1],
    ])('refuses an admission signed %s', (_name, createdAt) => {
      const invited = invitation([base], owner, {}, 10);
      const ledger = ledgerOf(invited.operation);

      expect(() =>
        ledger.admit(
          admission([invited.operation], invited, alice, owner, createdAt),
        ),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('admits an admission signed at either end of the window', () => {
      const invited = invitation([base], owner, {}, 10);
      const first = admission([invited.operation], invited, alice, owner, 10);

      expect(() =>
        ledgerOf(
          invited.operation,
          first,
          admission([first], invited, bob, owner, 10 + 7 * DAY),
        ),
      ).not.toThrow();
    });

    it('refuses a second admission of one identity, even after it left', () => {
      const invited = invitation([base], owner, {}, 10);
      const admitted = admission(
        [invited.operation],
        invited,
        alice,
        owner,
        11,
      );
      const left = leave([admitted], alice);
      const ledger = ledgerOf(invited.operation, admitted, left);

      expect(() =>
        ledger.admit(admission([left], invited, alice, owner, 12)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses an admission once the uses are exhausted', () => {
      const invited = invitation([base], owner, { maxUses: 1 }, 10);
      const admitted = admission(
        [invited.operation],
        invited,
        alice,
        owner,
        11,
      );
      const ledger = ledgerOf(invited.operation, admitted);

      expect(() =>
        ledger.admit(admission([admitted], invited, bob, owner, 12)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses the admission of a banned identity or of a member', () => {
      const invited = invitation([base], owner, {}, 10);
      const banned = ban([invited.operation], alice);
      const ledger = ledgerOf(invited.operation, banned);

      expect(() =>
        ledger.admit(admission([banned], invited, alice, owner, 11)),
      ).toThrow();
      expect(() =>
        ledger.admit(admission([banned], invited, carol, owner, 11)),
      ).toThrow();
    });

    it('refuses an admission under a revoked invitation', () => {
      const invited = invitation([base], owner, {}, 10);
      const revoked = revoke([invited.operation], invited, mallory);
      const ledger = ledgerOf(invited.operation, revoked);

      expect(() =>
        ledger.admit(admission([revoked], invited, alice, owner, 11)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses an admission under the invitation of a banned issuer', () => {
      const invited = invitation([base], mallory, {}, 10);
      const banned = ban([invited.operation], mallory);
      const ledger = ledgerOf(invited.operation, banned);

      expect(() =>
        ledger.admit(admission([banned], invited, alice, owner, 11)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('keeps the invitation of a removed issuer dead after it is promoted again', () => {
      const invited = invitation([base], mallory, {}, 10);
      const kicked = kick([invited.operation], mallory, owner, 11);
      const readded = join([kicked], mallory);
      const promoted = assignRoles([readded], mallory, [managers], owner, 12);
      const ledger = ledgerOf(invited.operation, kicked, readded, promoted);

      expect(() =>
        ledger.admit(admission([promoted], invited, alice, owner, 13)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses a second revocation and a revocation of an unknown invitation', () => {
      const invited = invitation([base], owner, {}, 10);
      const revoked = revoke([invited.operation], invited);
      const ledger = ledgerOf(invited.operation, revoked);

      expect(() => ledger.admit(revoke([revoked], invited, mallory))).toThrow(
        InvalidCommunityOperationError,
      );
      expect(() => ledger.admit(revoke([base], invited, mallory))).toThrow(
        CommunityInvitationNotFoundError,
      );
    });

    it('refuses a revocation by a member that neither issued it nor manages members', () => {
      const invited = invitation([base], owner, {}, 10);
      const ledger = ledgerOf(invited.operation);

      expect(() =>
        ledger.admit(revoke([invited.operation], invited, carol)),
      ).toThrow(InvalidCommunityOperationError);
    });

    it('lets an issuer revoke while a member, and not once removed', () => {
      const promoted = assignRoles([base], carol, [managers], owner, 4);
      const invited = invitation([promoted], carol, {}, 10);
      const demoted = assignRoles([invited.operation], carol, [], owner, 11);
      const kicked = kick([demoted], carol, owner, 12);
      const ledger = ledgerOf(promoted, invited.operation, demoted);

      expect(() =>
        ledger.admit(revoke([demoted], invited, carol)),
      ).not.toThrow();

      ledger.admit(kicked);

      expect(() => ledger.admit(revoke([kicked], invited, carol))).toThrow();
    });
  });
});
