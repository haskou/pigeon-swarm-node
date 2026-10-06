import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';

import {
  add,
  alice,
  bob,
  carol,
  creator,
  groupGenesis,
  leave,
  mallory,
  oneToOneGenesis,
  promote,
  remove,
} from '../../../domain/operations/ConversationOperationFixtures';

describe('ConversationOperationMutationPolicy', () => {
  let policy: ConversationOperationMutationPolicy;

  beforeEach(() => {
    policy = new ConversationOperationMutationPolicy();
  });

  function record(op: ConversationOperation): Record<string, unknown> {
    return { ...op.toPrimitives() };
  }

  function admit(op: ConversationOperation): Promise<void> {
    return policy.assertPermitted(
      record(op),
      op.getAuthorIdentityId().valueOf(),
      false,
    );
  }

  describe('expectationOf', () => {
    it('binds the proof to the operation id, its author and the operations store', () => {
      const created = groupGenesis();

      expect(policy.expectationOf(record(created))).toEqual({
        authorIdentityId: creator.valueOf(),
        recordId: created.getId(),
        store: 'conversationOperations',
      });
    });

    it('refuses a record with an unexpected field', () => {
      expect(() =>
        policy.expectationOf({ ...record(groupGenesis()), extra: true }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a record whose content does not hash to its id', () => {
      expect(() =>
        policy.expectationOf({
          ...record(groupGenesis()),
          createdAt: 99,
        }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a record whose id was swapped for another operation', () => {
      expect(() =>
        policy.expectationOf({
          ...record(add([groupGenesis()], bob)),
          id: groupGenesis().getId(),
        }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a tombstone', () => {
      expect(() =>
        policy.expectationOf({ ...record(groupGenesis()), removed: true }),
      ).toThrow(InvalidPublicMutationError);
    });
  });

  describe('assertPermitted', () => {
    it('refuses to delete an operation', async () => {
      await expect(
        policy.assertPermitted(
          record(groupGenesis()),
          creator.valueOf(),
          true,
        ),
      ).rejects.toThrow(InvalidPublicMutationError);
    });

    it('admits what the roster of its causal past allows', async () => {
      const created = groupGenesis();
      const promoted = promote([created], alice);

      await admit(created);
      await admit(promoted);
      await expect(admit(add([promoted], bob, alice))).resolves.toBeUndefined();
    });

    it('refuses an operation whose parents were not admitted, then admits it after they arrive', async () => {
      const created = groupGenesis();
      const first = add([created], bob);
      const next = add([first], carol);

      await admit(created);
      await expect(admit(next)).rejects.toThrow();

      await admit(first);

      await expect(admit(next)).resolves.toBeUndefined();
    });

    it('refuses a forged add signed by a plain member', async () => {
      const created = groupGenesis();

      await admit(created);

      await expect(admit(add([created], bob, alice))).rejects.toThrow();
    });

    it('refuses a forged add signed by somebody who is not in the group', async () => {
      const created = groupGenesis();

      await admit(created);

      await expect(admit(add([created], mallory, mallory))).rejects.toThrow();
    });

    it('refuses the removal of the creator', async () => {
      const created = groupGenesis();
      const promoted = promote([created], alice);

      await admit(created);
      await admit(promoted);

      await expect(admit(remove([promoted], creator, alice))).rejects.toThrow();
    });

    it('refuses a creation that does not list its author', async () => {
      await expect(admit(groupGenesis([alice, bob]))).rejects.toThrow();
    });

    it('refuses any change of a 1:1 conversation', async () => {
      const created = oneToOneGenesis();

      await admit(created);

      await expect(admit(leave([created], alice))).rejects.toThrow();
      await expect(admit(add([created], bob))).rejects.toThrow();
    });

    it('keeps the history of two conversations apart', async () => {
      const created = groupGenesis();
      const other = oneToOneGenesis();

      await admit(created);
      await admit(other);

      await expect(admit(add([created], bob))).resolves.toBeUndefined();
      await expect(admit(add([other], bob))).rejects.toThrow();
    });
  });
});
