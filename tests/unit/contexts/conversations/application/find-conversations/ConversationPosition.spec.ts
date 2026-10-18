import { ConversationPosition } from '@app/contexts/conversations/application/find-conversations/ConversationPosition';

describe('ConversationPosition.isValid', () => {
  const TIMESTAMP = '10000000000001000';

  it('accepts a timestamp and a conversation id joined by a pipe', () => {
    expect(ConversationPosition.isValid(`${TIMESTAMP}|one-to-one:abc`)).toBe(
      true,
    );
  });

  it('accepts the largest encodable timestamp', () => {
    expect(
      ConversationPosition.isValid('17280000000000000|one-to-one:abc'),
    ).toBe(true);
  });

  it.each([
    ['a missing pipe', `${TIMESTAMP}one-to-one:abc`],
    ['a non-numeric timestamp', 'abc|one-to-one:abc'],
    ['a 16-digit timestamp', '1000000000000100|one-to-one:abc'],
    ['a timestamp above the range', '17280000000000001|one-to-one:abc'],
    ['an empty conversation id', `${TIMESTAMP}|`],
    ['an empty position', ''],
  ])('rejects %s', (_label, position) => {
    expect(ConversationPosition.isValid(position)).toBe(false);
  });
});
