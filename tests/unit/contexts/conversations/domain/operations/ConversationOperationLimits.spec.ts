import { ConversationOperationLimitExceededError } from '@app/contexts/conversations/domain/errors/ConversationOperationLimitExceededError';
import { ConversationOperation } from '@app/contexts/conversations/domain/operations/ConversationOperation';
import { ConversationOperationLimits } from '@app/contexts/conversations/domain/operations/ConversationOperationLimits';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';

import { alice, creator, operation } from './ConversationOperationFixtures';

describe('ConversationOperationLimits', () => {
  describe('arguments', () => {
    const genesisWith = (padding: string) =>
      operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        creator,
        {
          padding,
          participantIds: [creator.valueOf(), alice.valueOf()],
          type: 'one-to-one',
        },
        [],
      );
    const bytesWithoutPadding = JSON.stringify({
      padding: '',
      participantIds: [creator.valueOf(), alice.valueOf()],
      type: 'one-to-one',
    }).length;

    it('refuses an operation whose arguments exceed the byte limit', () => {
      expect(() =>
        genesisWith(
          'x'.repeat(
            ConversationOperationLimits.MAX_ARGUMENT_BYTES -
              bytesWithoutPadding +
              1,
          ),
        ),
      ).toThrow(ConversationOperationLimitExceededError);
    });

    it('admits arguments at the limit', () => {
      expect(() =>
        genesisWith(
          'x'.repeat(
            ConversationOperationLimits.MAX_ARGUMENT_BYTES -
              bytesWithoutPadding,
          ),
        ),
      ).not.toThrow();
    });
  });

  describe('argument depth', () => {
    /** A value whose deepest leaf sits `levels` below it. */
    const chain = (levels: number): unknown =>
      levels === 0 ? 'leaf' : [chain(levels - 1)];
    /**
     * Signs a genesis whose `args` hold a value `depth` levels below `args`
     * (depth 0). `args` is itself depth 1 of the digested operation.
     */
    const genesisAt = (depth: number) =>
      operation(
        ConversationOperationAction.CONVERSATION_CREATED,
        creator,
        {
          padding: chain(depth - 1),
          participantIds: [creator.valueOf(), alice.valueOf()],
          type: 'one-to-one',
        },
        [],
      );

    it('accepts arguments 63 levels deep, which puts the operation at the 64-level digest limit', () => {
      const accepted = genesisAt(63);

      expect(
        ConversationOperation.fromPrimitives(accepted.toPrimitives()).getHash(),
      ).toBe(accepted.getHash());
    });

    it('refuses arguments 64 levels deep, which would put the operation at 65, with the operation limit error', () => {
      expect(() => genesisAt(64)).toThrow(
        ConversationOperationLimitExceededError,
      );
    });

    it('refuses a replicated record whose arguments are 64 levels deep', () => {
      const genesis = genesisAt(1).toPrimitives();
      const record = {
        ...genesis,
        args: { ...genesis.args, padding: chain(63) },
      };

      expect(() => ConversationOperation.fromPrimitives(record)).toThrow(
        ConversationOperationLimitExceededError,
      );
    });
  });
});
