import { ConversationOperationLimitExceededError } from '@app/contexts/conversations/domain/errors/ConversationOperationLimitExceededError';
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
});
