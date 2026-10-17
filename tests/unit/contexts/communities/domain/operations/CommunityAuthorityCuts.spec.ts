import { CommunityInvitation } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitation';
import { CommunityAuthorityCuts } from '@app/contexts/communities/domain/operations/CommunityAuthorityCuts';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityOperationAncestry } from '@app/contexts/communities/domain/operations/CommunityOperationAncestry';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';

import {
  admission,
  alice,
  assignRoles,
  carol,
  genesis,
  invitation,
  join,
  kick,
  leave,
  mallory,
  owner,
  revoke,
  role,
} from './CommunityOperationFixtures';

/** The cuts of `operations`, decided the way the fold decides them. */
function cutsOf(operations: CommunityOperation[]): CommunityAuthorityCuts {
  const ordered = CommunityStateFold.orderOf(operations);

  return new CommunityAuthorityCuts(
    ordered,
    new CommunityOperationAncestry(ordered),
    (operation) =>
      CommunityAuthorityCuts.takenBy(
        CommunityStateFold.fold(
          CommunityStateFold.closureOf(ordered, operation.getParents()),
        ).community,
        operation,
      ),
  );
}

describe('CommunityAuthorityCuts', () => {
  const created = genesis();
  const managers = role([created], ['create_invites', 'manage_members'], 2);
  const malloryJoins = join([managers], mallory);
  const carolJoins = join([malloryJoins], carol);
  const malloryManages = assignRoles(
    [carolJoins],
    mallory,
    [managers],
    owner,
    3,
  );
  const base = assignRoles([malloryManages], carol, [managers], owner, 4);
  const history = [
    created,
    managers,
    malloryJoins,
    carolJoins,
    malloryManages,
    base,
  ];

  describe('takenBy', () => {
    it('takes membership and every permission a kick removes', () => {
      const past = CommunityStateFold.fold(history).community;

      expect(
        [...CommunityAuthorityCuts.takenBy(past, kick([base], mallory))].sort(),
      ).toEqual(
        [
          `create_invites ${mallory.valueOf()}`,
          `manage_members ${mallory.valueOf()}`,
          `membership ${mallory.valueOf()}`,
        ].sort(),
      );
    });

    it('takes the permissions of a role change and keeps the membership', () => {
      const past = CommunityStateFold.fold(history).community;

      expect(
        [
          ...CommunityAuthorityCuts.takenBy(
            past,
            assignRoles([base], mallory, [], owner, 5),
          ),
        ].sort(),
      ).toEqual(
        [
          `create_invites ${mallory.valueOf()}`,
          `manage_members ${mallory.valueOf()}`,
        ].sort(),
      );
    });

    it('takes nothing from an operation the past does not permit or that cuts nothing', () => {
      const past = CommunityStateFold.fold(history).community;

      expect(
        CommunityAuthorityCuts.takenBy(past, kick([base], owner, mallory)).size,
      ).toBe(0);
      expect(
        CommunityAuthorityCuts.takenBy(past, invitation([base]).operation).size,
      ).toBe(0);
      expect(
        CommunityAuthorityCuts.takenBy(undefined, kick([base], mallory)).size,
      ).toBe(0);
    });
  });

  describe('isVoid', () => {
    it('voids an invitation and an admission a concurrent kick of their author reaches', () => {
      const invited = invitation([base], mallory, {}, 10);
      const admitted = admission(
        [invited.operation],
        invited,
        alice,
        mallory,
        11,
      );
      const kicked = kick([base], mallory, owner, 12);
      const cuts = cutsOf([...history, invited.operation, admitted, kicked]);

      expect(cuts.isVoid(invited.operation)).toBe(true);
      expect(cuts.isVoid(admitted)).toBe(true);
      expect(
        cuts.cutsIssuerOf(CommunityInvitation.fromOperation(invited.operation)),
      ).toBe(true);
    });

    it('keeps what was signed before the kick, and closes the invitation for later admissions', () => {
      const invited = invitation([base], mallory, {}, 10);
      const admitted = admission(
        [invited.operation],
        invited,
        alice,
        mallory,
        11,
      );
      const kicked = kick([admitted], mallory, owner, 12);
      const cuts = cutsOf([...history, invited.operation, admitted, kicked]);

      expect(cuts.isVoid(invited.operation)).toBe(false);
      expect(cuts.isVoid(admitted)).toBe(false);
      expect(
        cuts.cutsIssuerOf(CommunityInvitation.fromOperation(invited.operation)),
      ).toBe(true);
    });

    it('voids what a concurrent role change takes the permission of', () => {
      const invited = invitation([base], mallory, {}, 10);
      const demoted = assignRoles([base], mallory, [], owner, 12);
      const cuts = cutsOf([...history, invited.operation, demoted]);

      expect(cuts.isVoid(invited.operation)).toBe(true);
    });

    it('voids the invitations an issuer signed since the old parents it leaves with', () => {
      const invited = invitation([base], mallory, {}, 10);
      const left = leave([base], mallory);
      const cuts = cutsOf([...history, invited.operation, left]);

      expect(cuts.isVoid(invited.operation)).toBe(true);
    });

    it('never voids a revocation, even one a kick of its author reaches', () => {
      const invited = invitation([base], owner, {}, 10);
      const revoked = revoke([invited.operation], invited, mallory);
      const kicked = kick([base], mallory, owner, 12);
      const cuts = cutsOf([...history, invited.operation, revoked, kicked]);

      expect(cuts.isVoid(revoked)).toBe(false);
    });

    it('voids the backdated cut of a removed member, so its target keeps inviting', () => {
      const removed = kick([base], mallory, owner, 10);
      const answer = kick([base], carol, mallory, 11);
      const invited = invitation([base], carol, {}, 12);
      const cuts = cutsOf([...history, removed, answer, invited.operation]);

      expect(cuts.isVoid(invited.operation)).toBe(false);
      expect(
        cuts.cutsIssuerOf(CommunityInvitation.fromOperation(invited.operation)),
      ).toBe(false);
    });

    it('lets mutual cuts both stand, each voiding the acts of the other', () => {
      const byCarol = kick([base], mallory, carol, 10);
      const byMallory = kick([base], carol, mallory, 11);
      const carolInvites = invitation([base], carol, {}, 12);
      const malloryInvites = invitation([base], mallory, {}, 13);
      const cuts = cutsOf([
        ...history,
        byCarol,
        byMallory,
        carolInvites.operation,
        malloryInvites.operation,
      ]);

      expect(cuts.isVoid(carolInvites.operation)).toBe(true);
      expect(cuts.isVoid(malloryInvites.operation)).toBe(true);
    });

    it('bounds the reach of a cycle cut to what its author had not built on', () => {
      const carolInvites = invitation([base], carol, {}, 10);
      const malloryInvites = invitation(
        [carolInvites.operation],
        mallory,
        {},
        11,
      );
      const removal = kick([carolInvites.operation], mallory, carol, 12);
      const answer = kick([base], carol, mallory, 13);
      const cuts = cutsOf([
        ...history,
        carolInvites.operation,
        malloryInvites.operation,
        removal,
        answer,
      ]);

      expect(cuts.isVoid(carolInvites.operation)).toBe(false);
      expect(cuts.isVoid(malloryInvites.operation)).toBe(true);
    });

    it('decides the same cuts whatever order the operations arrive in', () => {
      const carolInvites = invitation([base], carol, {}, 10);
      const malloryInvites = invitation(
        [carolInvites.operation],
        mallory,
        {},
        11,
      );
      const operations = [
        ...history,
        carolInvites.operation,
        malloryInvites.operation,
        kick([carolInvites.operation], mallory, carol, 12),
        kick([base], carol, mallory, 13),
      ];

      for (const arrival of [operations, [...operations].reverse()]) {
        const cuts = cutsOf(arrival);

        expect([
          cuts.isVoid(carolInvites.operation),
          cuts.isVoid(malloryInvites.operation),
        ]).toEqual([false, true]);
      }
    });
  });
});
