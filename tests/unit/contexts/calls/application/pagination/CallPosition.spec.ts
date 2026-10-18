import { CallPosition } from '@app/contexts/calls/application/pagination/CallPosition';

describe('CallPosition.isValid', () => {
  const CALL_ID = '3f1c2a8e-9b7d-4c5e-8a1f-2b3c4d5e6f70';
  const TIMESTAMP = '10000000000001000';

  it('accepts a timestamp and a call id joined by a pipe', () => {
    expect(CallPosition.isValid(`${TIMESTAMP}|${CALL_ID}`)).toBe(true);
  });

  it('accepts the largest encodable timestamp', () => {
    expect(CallPosition.isValid(`17280000000000000|${CALL_ID}`)).toBe(true);
  });

  it.each([
    ['a missing pipe', `${TIMESTAMP}${CALL_ID}`],
    ['a non-numeric timestamp', `abc|${CALL_ID}`],
    ['a 16-digit timestamp', `1000000000000100|${CALL_ID}`],
    ['a timestamp above the range', `17280000000000001|${CALL_ID}`],
    ['a call id that is not a UUID', `${TIMESTAMP}|notanid`],
    ['an empty call id', `${TIMESTAMP}|`],
    ['an empty position', ''],
  ])('rejects %s', (_label, position) => {
    expect(CallPosition.isValid(position)).toBe(false);
  });
});
