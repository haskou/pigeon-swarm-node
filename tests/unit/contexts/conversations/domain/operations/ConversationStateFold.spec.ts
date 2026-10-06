import { InvalidConversationOperationError } from '@app/contexts/conversations/domain/errors/InvalidConversationOperationError';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationApplier } from '@app/contexts/conversations/domain/operations/ConversationOperationApplier';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';

import {
  add,
  alice,
  bob,
  carol,
  creator,
  dave,
  demote,
  groupGenesis,
  leave,
  mallory,
  networkId,
  nonce,
  oneToOneGenesis,
  operation,
  promote,
  remove,
} from './ConversationOperationFixtures';

function stateOf(operations: ConversationOperation[]) {
  const state = ConversationStateFold.fold(operations);

  return {
    admins: state.roster?.getAdmins(),
    frontier: state.frontier,
    members: state.roster?.getMembers(),
    skipped: [...state.skipped].sort(),
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed;

  for (let index = result.length - 1; index > 0; index--) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swap = state % (index + 1);

    [result[index], result[swap]] = [result[swap], result[index]];
  }

  return result;
}

describe('ConversationStateFold', () => {
  describe('genesis', () => {
    it('folds a group genesis into its signed participants and creator', () => {
      const state = ConversationStateFold.fold([
        groupGenesis([creator, alice]),
      ]);

      expect(state.roster?.getMembers()).toEqual([
        creator.valueOf(),
        alice.valueOf(),
      ]);
      expect(state.roster?.getCreator()).toBe(creator.valueOf());
      expect(state.roster?.getAdmins()).toEqual([]);
      expect(state.skipped).toEqual([]);
    });

    it('refuses a group genesis that does not name its author as participant', () => {
      const forged = operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        creator,
        {
          name: 'Group',
          nonce,
          participantIds: [alice.valueOf(), bob.valueOf()],
          type: 'group',
        },
        [],
      );

      expect(() => ConversationOperationApplier.create(forged)).toThrow(
        InvalidConversationOperationError,
      );
      expect(ConversationStateFold.fold([forged]).roster).toBeUndefined();
    });

    it('refuses a genesis whose participants are not strictly ascending', () => {
      const forged = operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        creator,
        {
          name: 'Group',
          nonce,
          participantIds: [alice.valueOf(), creator.valueOf()],
          type: 'group',
        },
        [],
      );

      expect(() => ConversationOperationApplier.create(forged)).toThrow(
        InvalidConversationOperationError,
      );
    });

    it('refuses a genesis that claims the id of a group of somebody else', () => {
      expect(() =>
        operation(
          ConversationOperationAction.CONVERSATION_CREATED,
          mallory,
          {
            name: 'Group',
            nonce,
            participantIds: [mallory.valueOf(), creator.valueOf()].sort(),
            type: 'group',
          },
          [],
          1,
          ConversationId.deriveGroup(
            networkId.valueOf(),
            creator.valueOf(),
            nonce,
          ),
        ),
      ).toThrow(InvalidConversationOperationError);
    });

    it('refuses a 1:1 genesis signed by somebody who is not one of the two', () => {
      const forged = operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        mallory,
        {
          participantIds: [creator.valueOf(), alice.valueOf()],
          type: 'one-to-one',
        },
        [],
        1,
        ConversationId.deterministic(creator, alice, networkId),
      );

      expect(() => ConversationOperationApplier.create(forged)).toThrow(
        InvalidConversationOperationError,
      );
    });

    it('refuses a 1:1 genesis that does not have exactly two participants', () => {
      expect(() =>
        operation(
          ConversationOperationAction.CONVERSATION_CREATED,
          creator,
          {
            participantIds: [creator.valueOf(), alice.valueOf(), bob.valueOf()],
            type: 'one-to-one',
          },
          [],
        ),
      ).toThrow(InvalidConversationOperationError);
    });
  });

  describe('one-to-one immutability', () => {
    it.each([
      [ConversationOperationAction.MEMBER_ADDED, creator, bob.valueOf()],
      [ConversationOperationAction.MEMBER_REMOVED, creator, alice.valueOf()],
      [ConversationOperationAction.MEMBER_LEFT, alice, undefined],
      [ConversationOperationAction.ADMIN_PROMOTED, creator, alice.valueOf()],
    ])('skips a 1:1 %s', (action, author, target) => {
      const genesis = oneToOneGenesis();
      const forged = operation(
        action,
        author,
        target ? { identityId: target } : {},
        [genesis],
        2,
        genesis.getConversationId(),
      );

      expect(() =>
        ConversationStateFold.rosterAfter([genesis], forged),
      ).toThrow(InvalidConversationOperationError);
      expect(ConversationStateFold.fold([genesis, forged])).toMatchObject({
        skipped: [forged.getHash()],
      });
      expect(
        ConversationStateFold.fold([genesis, forged]).roster?.getMembers(),
      ).toEqual([creator.valueOf(), alice.valueOf()]);
    });
  });

  describe('permissions', () => {
    it('lets the creator add a member', () => {
      const genesis = groupGenesis();
      const added = add([genesis], bob);

      expect(stateOf([genesis, added]).members).toEqual([
        creator.valueOf(),
        alice.valueOf(),
        bob.valueOf(),
      ]);
    });

    it('skips an add signed by a plain member', () => {
      const genesis = groupGenesis();
      const forged = add([genesis], bob, alice);

      expect(stateOf([genesis, forged])).toMatchObject({
        members: [creator.valueOf(), alice.valueOf()],
        skipped: [forged.getHash()],
      });
      expect(() =>
        ConversationStateFold.rosterAfter([genesis], forged),
      ).toThrow(InvalidConversationOperationError);
    });

    it('skips an add signed by somebody who is not in the group', () => {
      const genesis = groupGenesis();
      const forged = add([genesis], bob, mallory);

      expect(stateOf([genesis, forged]).skipped).toEqual([forged.getHash()]);
    });

    it('lets an admin named by the creator add and remove plain members', () => {
      const genesis = groupGenesis();
      const promoted = promote([genesis], alice);
      const added = add([promoted], bob, alice);
      const removed = remove([added], bob, alice);

      expect(stateOf([genesis, promoted, added]).members).toContain(
        bob.valueOf(),
      );
      expect(
        stateOf([genesis, promoted, added, removed]).members,
      ).not.toContain(bob.valueOf());
    });

    it('skips a promotion signed by an admin: only the creator names admins', () => {
      const genesis = groupGenesis([creator, alice, bob]);
      const promoted = promote([genesis], alice);
      const forged = promote([promoted], bob, alice);

      expect(stateOf([genesis, promoted, forged])).toMatchObject({
        admins: [alice.valueOf()],
        skipped: [forged.getHash()],
      });
    });

    it('skips the removal of an admin by another admin but lets the creator do it', () => {
      const genesis = groupGenesis([creator, alice, bob]);
      const promotedAlice = promote([genesis], alice);
      const promotedBob = promote([promotedAlice], bob);
      const forged = remove([promotedBob], bob, alice);
      const legitimate = remove([promotedBob], bob, creator);

      expect(
        stateOf([genesis, promotedAlice, promotedBob, forged]),
      ).toMatchObject({ skipped: [forged.getHash()] });
      expect(
        stateOf([genesis, promotedAlice, promotedBob, legitimate]),
      ).toMatchObject({
        admins: [alice.valueOf()],
        members: [creator.valueOf(), alice.valueOf()],
        skipped: [],
      });
    });

    it('never removes the creator', () => {
      const genesis = groupGenesis();
      const promoted = promote([genesis], alice);
      const forged = remove([promoted], creator, alice);

      expect(stateOf([genesis, promoted, forged]).skipped).toEqual([
        forged.getHash(),
      ]);
    });

    it('demotes an admin only when the creator signs it', () => {
      const genesis = groupGenesis([creator, alice, bob]);
      const promotedAlice = promote([genesis], alice);
      const promotedBob = promote([promotedAlice], bob);
      const forged = demote([promotedBob], bob, alice);
      const legitimate = demote([promotedBob], alice, creator);

      expect(
        stateOf([genesis, promotedAlice, promotedBob, forged]),
      ).toMatchObject({
        admins: [alice.valueOf(), bob.valueOf()],
        skipped: [forged.getHash()],
      });
      expect(
        stateOf([genesis, promotedAlice, promotedBob, legitimate]).admins,
      ).toEqual([bob.valueOf()]);
    });

    it('takes the permissions away from a demoted admin', () => {
      const genesis = groupGenesis();
      const promoted = promote([genesis], alice);
      const demoted = demote([promoted], alice);
      const late = add([demoted], bob, alice);

      expect(stateOf([genesis, promoted, demoted, late])).toMatchObject({
        admins: [],
        skipped: [late.getHash()],
      });
    });

    it('only promotes members', () => {
      const genesis = groupGenesis();
      const forged = promote([genesis], bob);

      expect(stateOf([genesis, forged]).skipped).toEqual([forged.getHash()]);
    });
  });

  describe('leaving', () => {
    it('lets a member leave by themselves, admin or not', () => {
      const genesis = groupGenesis([creator, alice, bob]);
      const promoted = promote([genesis], alice);
      const aliceLeft = leave([promoted], alice);
      const bobLeft = leave([aliceLeft], bob);

      expect(stateOf([genesis, promoted, aliceLeft, bobLeft])).toMatchObject({
        admins: [],
        members: [creator.valueOf()],
        skipped: [],
      });
    });

    it('skips a leave signed by somebody who is not a member', () => {
      const genesis = groupGenesis();
      const forged = leave([genesis], mallory);

      expect(stateOf([genesis, forged]).skipped).toEqual([forged.getHash()]);
    });

    it('does not let the creator leave: they own the group', () => {
      const genesis = groupGenesis();
      const forged = leave([genesis], creator);

      expect(stateOf([genesis, forged]).skipped).toEqual([forged.getHash()]);
    });

    it('lets a member who left be added again', () => {
      const genesis = groupGenesis();
      const left = leave([genesis], alice);
      const back = add([left], alice);

      expect(stateOf([genesis, left, back]).members).toEqual([
        creator.valueOf(),
        alice.valueOf(),
      ]);
    });

    it('rejects a leave that carries arguments', () => {
      const genesis = groupGenesis();
      const forged = operation(
        ConversationOperationAction.MEMBER_LEFT,
        alice,
        { identityId: creator.valueOf() },
        [genesis],
      );

      expect(stateOf([genesis, forged]).skipped).toEqual([forged.getHash()]);
    });
  });

  describe('causal past', () => {
    it('authorizes an operation against the roster of its parents, not the latest one', () => {
      const genesis = groupGenesis([creator, alice, bob]);
      const promoted = promote([genesis], alice);
      const removedBeforePromotion = remove([genesis], alice);
      const addedByAlice = add([promoted], carol, alice);

      // Alice is an admin where she signed; a concurrent removal does not
      // revoke what she did in her own past, only what comes after it.
      expect(
        ConversationStateFold.rosterAfter(
          [genesis, promoted, removedBeforePromotion],
          addedByAlice,
        ).getMembers(),
      ).toContain(carol.valueOf());
    });

    it('refuses an operation whose parent nobody knows', () => {
      const genesis = groupGenesis();
      const orphan = add([add([genesis], bob)], carol);

      expect(() =>
        ConversationStateFold.rosterAfter([genesis], orphan),
      ).toThrow(InvalidConversationOperationError);
    });

    it('ignores operations whose parents never arrive', () => {
      const genesis = groupGenesis();
      const missing = add([genesis], bob);
      const child = add([missing], carol);

      expect(stateOf([genesis, child])).toMatchObject({
        frontier: [genesis.getHash()],
        members: [creator.valueOf(), alice.valueOf()],
      });
    });

    it('keeps one removal winner when concurrent operations conflict', () => {
      const genesis = groupGenesis([creator, alice, bob]);
      const promoted = promote([genesis], alice);
      const kickedByAlice = remove([promoted], bob, alice);
      const promotedBob = promote([promoted], bob);
      const merged = add([kickedByAlice, promotedBob], dave);

      const state = stateOf([
        genesis,
        promoted,
        kickedByAlice,
        promotedBob,
        merged,
      ]);

      expect(state.skipped.length).toBeLessThanOrEqual(2);
      expect(state.frontier).toEqual([merged.getHash()]);
    });
  });

  describe('convergence', () => {
    it('folds every ordering of the same operations to the same state', () => {
      const genesis = groupGenesis([creator, alice, bob]);
      const promoted = promote([genesis], alice);
      const addedByAlice = add([promoted], carol, alice);
      const removedBob = remove([promoted], bob);
      const concurrentLeave = leave([promoted], bob);
      const merge = add([addedByAlice, removedBob, concurrentLeave], dave);
      const forged = add([genesis], mallory, bob);
      const operations = [
        genesis,
        promoted,
        addedByAlice,
        removedBob,
        concurrentLeave,
        merge,
        forged,
      ];
      const expected = stateOf(operations);

      for (let seed = 1; seed <= 40; seed++) {
        expect(stateOf(shuffled(operations, seed))).toEqual(expected);
      }
      expect(expected.skipped).toContain(forged.getHash());
      expect(expected.members).toContain(dave.valueOf());
    });
  });
});
