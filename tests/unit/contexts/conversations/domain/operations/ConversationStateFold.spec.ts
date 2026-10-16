import { InvalidConversationOperationError } from '@app/contexts/conversations/domain/errors/InvalidConversationOperationError';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationApplier } from '@app/contexts/conversations/domain/operations/ConversationOperationApplier';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';

import {
  alice,
  bob,
  creator,
  mallory,
  oneToOneGenesis,
  operation,
} from './ConversationOperationFixtures';

function stateOf(operations: ConversationOperation[]) {
  const state = ConversationStateFold.fold(operations);

  return {
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
    it('folds a 1:1 genesis into its two participants and creator', () => {
      const state = ConversationStateFold.fold([oneToOneGenesis()]);

      expect(state.roster?.getMembers()).toEqual([
        creator.valueOf(),
        alice.valueOf(),
      ]);
      expect(state.roster?.getCreator()).toBe(creator.valueOf());
      expect(state.skipped).toEqual([]);
    });

    it('refuses a group genesis: group rosters live in MLS', () => {
      expect(() =>
        operation(
          ConversationOperationAction.CONVERSATION_CREATED,
          creator,
          {
            name: 'Group',
            nonce: 'genesis-nonce',
            participantIds: [creator.valueOf(), alice.valueOf()],
            type: 'group',
          },
          [],
        ),
      ).toThrow(InvalidConversationOperationError);
    });

    it('refuses a genesis whose participants are not strictly ascending', () => {
      const forged = operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        creator,
        {
          participantIds: [alice.valueOf(), creator.valueOf()],
          type: 'one-to-one',
        },
        [],
      );

      expect(() => ConversationOperationApplier.create(forged)).toThrow(
        InvalidConversationOperationError,
      );
      expect(ConversationStateFold.fold([forged]).roster).toBeUndefined();
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
      );

      expect(() => ConversationOperationApplier.create(forged)).toThrow(
        InvalidConversationOperationError,
      );
      expect(ConversationStateFold.fold([forged]).roster).toBeUndefined();
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

  describe('a replayed genesis', () => {
    const genesisAt = (createdAt: number) =>
      operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        creator,
        {
          participantIds: [creator.valueOf(), alice.valueOf()],
          type: 'one-to-one',
        },
        [],
        createdAt,
      );

    it('keeps one roster and skips every other genesis', () => {
      const state = ConversationStateFold.fold([1, 2, 3].map(genesisAt));

      expect(state.roster?.getMembers()).toEqual([
        creator.valueOf(),
        alice.valueOf(),
      ]);
      expect(state.skipped).toHaveLength(2);
    });

    it('keeps the genesis with the lowest digest', () => {
      const operations = [1, 2, 3].map(genesisAt);
      const kept = operations.map((genesis) => genesis.getHash()).sort()[0];

      expect(ConversationStateFold.fold(operations).skipped).not.toContain(
        kept,
      );
    });

    it('folds every ordering of the same operations to the same state', () => {
      const operations = [1, 2, 3, 4, 5].map(genesisAt);
      const expected = stateOf(operations);

      for (let seed = 1; seed <= 40; seed++) {
        expect(stateOf(shuffled(operations, seed))).toEqual(expected);
      }
      expect(expected.members).toEqual([creator.valueOf(), alice.valueOf()]);
      expect(expected.skipped).toHaveLength(4);
    });
  });
});
