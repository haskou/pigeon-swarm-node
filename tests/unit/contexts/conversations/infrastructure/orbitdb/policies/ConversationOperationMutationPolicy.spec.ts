import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';

import { legacyGroupGenesis } from '../../../../../../support/legacyGroupGenesis';
import {
  add,
  alice,
  bob,
  creator,
  leave,
  mallory,
  networkId,
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
      const created = oneToOneGenesis();

      expect(policy.expectationOf(record(created))).toEqual({
        authorIdentityId: creator.valueOf(),
        recordId: created.getId(),
        store: 'conversationOperations',
      });
    });

    it('refuses a record with an unexpected field', () => {
      expect(() =>
        policy.expectationOf({ ...record(oneToOneGenesis()), extra: true }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a record whose content does not hash to its id', () => {
      expect(() =>
        policy.expectationOf({
          ...record(oneToOneGenesis()),
          createdAt: 99,
        }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a record whose id was swapped for another operation', () => {
      expect(() =>
        policy.expectationOf({
          ...record(add([oneToOneGenesis()], bob)),
          id: oneToOneGenesis().getId(),
        }),
      ).toThrow(InvalidPublicMutationError);
    });

    it('refuses a tombstone', () => {
      expect(() =>
        policy.expectationOf({ ...record(oneToOneGenesis()), removed: true }),
      ).toThrow(InvalidPublicMutationError);
    });
  });

  describe('assertPermitted', () => {
    it('refuses to delete an operation', async () => {
      await expect(
        policy.assertPermitted(
          record(oneToOneGenesis()),
          creator.valueOf(),
          true,
        ),
      ).rejects.toThrow(InvalidPublicMutationError);
    });

    it('admits the genesis of a 1:1 conversation', async () => {
      await expect(admit(oneToOneGenesis())).resolves.toBeUndefined();
    });

    it('refuses any change of a 1:1 conversation', async () => {
      const created = oneToOneGenesis();

      await admit(created);

      await expect(admit(leave([created], alice))).rejects.toThrow();
      await expect(admit(add([created], bob))).rejects.toThrow();
      await expect(admit(remove([created], alice))).rejects.toThrow();
      await expect(admit(promote([created], alice))).rejects.toThrow();
      await expect(admit(add([created], mallory, mallory))).rejects.toThrow();
    });
  });

  describe('a group conversation replicated by an older node', () => {
    const legacy = legacyGroupGenesis({
      creatorIdentityId: creator.valueOf(),
      networkId: networkId.valueOf(),
      participantIds: [creator.valueOf(), alice.valueOf()],
    });

    it('refuses its genesis before checking the proof', () => {
      expect(() => policy.expectationOf({ ...legacy })).toThrow(
        InvalidPublicMutationError,
      );
    });

    it('refuses to admit its genesis', async () => {
      await expect(
        policy.assertPermitted({ ...legacy }, creator.valueOf(), false),
      ).rejects.toThrow(InvalidPublicMutationError);
    });
  });
});
