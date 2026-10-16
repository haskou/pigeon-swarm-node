import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';

import { cryptoVectors } from '../../../../../support/cryptoVectors';

interface Section {
  invalid: { args: [string, string, string]; name: string }[];
  valid: { args: [string, string, string]; id: string; name: string }[];
}

const { oneToOneConversation } =
  cryptoVectors<Record<string, Section>>('commitment-ids');

describe('ConversationId one-to-one commitment id vectors', () => {
  it.each(oneToOneConversation.valid)('derives $name', ({ args, id }) => {
    expect(ConversationId.deterministic(...args).valueOf()).toBe(id);
  });

  it.each(oneToOneConversation.invalid)('rejects $name', ({ args }) => {
    expect(() => ConversationId.deterministic(...args)).toThrow();
  });
});
