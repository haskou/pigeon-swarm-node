import { ConversationDraftPosition } from '@app/contexts/conversations/application/manage-draft/ConversationDraftPosition';

describe('ConversationDraftPosition.isValid', () => {
  const TIMESTAMP = '10000000000001000';
  const DRAFT_KEY = 'A'.repeat(43);

  it('accepts a timestamp and a 43-character draft key joined by a pipe', () => {
    expect(ConversationDraftPosition.isValid(`${TIMESTAMP}|${DRAFT_KEY}`)).toBe(
      true,
    );
  });

  it('accepts the largest encodable timestamp', () => {
    expect(
      ConversationDraftPosition.isValid(`17280000000000000|${DRAFT_KEY}`),
    ).toBe(true);
  });

  it.each([
    ['a missing pipe', `${TIMESTAMP}${DRAFT_KEY}`],
    ['a 16-digit timestamp', `1000000000000100|${DRAFT_KEY}`],
    ['a timestamp above the range', `17280000000000001|${DRAFT_KEY}`],
    [
      'a draft key shorter than 43 characters',
      `${TIMESTAMP}|${'A'.repeat(42)}`,
    ],
    ['a draft key longer than 43 characters', `${TIMESTAMP}|${'A'.repeat(44)}`],
    [
      'a draft key with characters outside base64url',
      `${TIMESTAMP}|${'+'.repeat(43)}`,
    ],
    ['an empty position', ''],
  ])('rejects %s', (_label, position) => {
    expect(ConversationDraftPosition.isValid(position)).toBe(false);
  });
});
