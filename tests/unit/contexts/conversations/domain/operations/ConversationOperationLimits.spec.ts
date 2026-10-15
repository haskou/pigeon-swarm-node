import { ConversationOperationLimitExceededError } from '@app/contexts/conversations/domain/errors/ConversationOperationLimitExceededError';
import { ConversationOperationLimits } from '@app/contexts/conversations/domain/operations/ConversationOperationLimits';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';

import {
  bob,
  creator,
  oneToOneGenesis,
  operation,
} from './ConversationOperationFixtures';

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
          [oneToOneGenesis()],
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
          [oneToOneGenesis()],
        ),
      ).not.toThrow();
    });
  });
});
