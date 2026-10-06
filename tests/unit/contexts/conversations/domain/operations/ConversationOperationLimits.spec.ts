import { ConversationOperationLimitExceededError } from '@app/contexts/conversations/domain/errors/ConversationOperationLimitExceededError';
import { InvalidConversationOperationError } from '@app/contexts/conversations/domain/errors/InvalidConversationOperationError';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationLedger } from '@app/contexts/conversations/domain/operations/ConversationOperationLedger';
import { ConversationOperationLimits } from '@app/contexts/conversations/domain/operations/ConversationOperationLimits';
import { ConversationStateFold } from '@app/contexts/conversations/domain/operations/ConversationStateFold';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import {
  add,
  alice,
  bob,
  carol,
  creator,
  groupGenesis,
  operation,
  promote,
  remove,
} from './ConversationOperationFixtures';

/**
 * A linear history in which `author` alternately adds and removes `target`,
 * each operation permitted at its turn.
 */
function toggles(
  parent: ConversationOperation,
  length: number,
  author: IdentityId,
  target: IdentityId,
): ConversationOperation[] {
  const chain: ConversationOperation[] = [];
  let previous = parent;

  for (let index = 0; index < length; index++) {
    previous =
      index % 2 === 0
        ? add([previous], target, author, index + 3)
        : remove([previous], target, author, index + 3);
    chain.push(previous);
  }

  return chain;
}

describe('ConversationOperationLimits', () => {
  describe('arguments', () => {
    it('refuses an operation whose arguments exceed the byte limit', () => {
      expect(() =>
        operation(
          ConversationOperationAction.MEMBER_ADDED,
          creator,
          {
            identityId: bob.valueOf(),
            padding: 'x'.repeat(ConversationOperationLimits.MAX_ARGUMENT_BYTES),
          },
          [groupGenesis()],
        ),
      ).toThrow(ConversationOperationLimitExceededError);
    });

    it('admits arguments at the limit', () => {
      const padding = 'x'.repeat(
        ConversationOperationLimits.MAX_ARGUMENT_BYTES -
          JSON.stringify({ identityId: bob.valueOf(), padding: '' }).length,
      );

      expect(() =>
        operation(
          ConversationOperationAction.MEMBER_ADDED,
          creator,
          { identityId: bob.valueOf(), padding },
          [groupGenesis()],
        ),
      ).not.toThrow();
    });
  });

  describe('group size', () => {
    it('refuses an add past the participant cap and admits up to it', async () => {
      const genesis = groupGenesis([creator, alice]);
      const ledger = new ConversationOperationLedger();
      let previous = genesis;

      ledger.admit(genesis);

      for (
        let members = 2;
        members < ConversationOperationLimits.MAX_GROUP_PARTICIPANTS;
        members++
      ) {
        const keyPair = await KeyPair.generate();

        previous = add(
          [previous],
          new IdentityId(keyPair.toPrimitives().publicKey),
          creator,
          members,
        );
        ledger.admit(previous);
      }

      expect(() => ledger.admit(add([previous], bob, creator, 1_000))).toThrow(
        InvalidConversationOperationError,
      );
    });
  });

  describe('author quota', () => {
    const quota = ConversationOperationLimits.MAX_OPERATIONS_PER_AUTHOR;

    function groupWithAdmin() {
      const genesis = groupGenesis([creator, alice, bob]);

      return { genesis, promoted: promote([genesis], alice) };
    }

    it('refuses the operation after an author spent the quota in its past', () => {
      const { genesis, promoted } = groupWithAdmin();
      const chain = toggles(promoted, quota, alice, carol);
      const ledger = new ConversationOperationLedger();

      [genesis, promoted, ...chain].forEach((item) => ledger.admit(item));

      expect(() =>
        ledger.admit(add([chain[chain.length - 1]], carol, alice, quota + 10)),
      ).toThrow(ConversationOperationLimitExceededError);
    });

    it('skips in the fold what is past the quota, whatever the order', () => {
      const { genesis, promoted } = groupWithAdmin();
      const chain = toggles(promoted, quota + 3, alice, carol);
      const operations = [genesis, promoted, ...chain];
      const state = ConversationStateFold.fold(operations);

      expect([...state.skipped].sort()).toEqual(
        chain
          .slice(quota)
          .map((item) => item.getHash())
          .sort(),
      );
      expect(
        [
          ...ConversationStateFold.fold([...operations].reverse()).skipped,
        ].sort(),
      ).toEqual([...state.skipped].sort());
    });

    it('never limits the creator', () => {
      const genesis = groupGenesis([creator, alice]);
      const chain = toggles(genesis, quota + 5, creator, carol);
      const ledger = new ConversationOperationLedger();

      [genesis, ...chain].forEach((item) => ledger.admit(item));

      expect(ConversationStateFold.fold([genesis, ...chain]).skipped).toEqual(
        [],
      );
    });
  });
});
