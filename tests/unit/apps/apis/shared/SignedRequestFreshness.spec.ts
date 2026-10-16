import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { assertSignedRequestTimestampIsFresh } from '@app/apps/apis/shared/SignedRequestFreshness';
import { SignedHttpRequestSignature } from '@haskou/pigeon-swarm-crypto';

describe('assertSignedRequestTimestampIsFresh', () => {
  const now = 1_800_000_000_000;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts a timestamp at the current instant', () => {
    expect(() =>
      assertSignedRequestTimestampIsFresh(String(now)),
    ).not.toThrow();
  });

  it('accepts a timestamp exactly at the clock-skew bound in either direction', () => {
    const skew = SignedHttpRequestSignature.MAX_CLOCK_SKEW_MS;

    expect(() =>
      assertSignedRequestTimestampIsFresh(String(now - skew)),
    ).not.toThrow();
    expect(() =>
      assertSignedRequestTimestampIsFresh(String(now + skew)),
    ).not.toThrow();
  });

  it.each([
    [
      'one millisecond past the bound',
      now - SignedHttpRequestSignature.MAX_CLOCK_SKEW_MS - 1,
    ],
    [
      'one millisecond beyond the future bound',
      now + SignedHttpRequestSignature.MAX_CLOCK_SKEW_MS + 1,
    ],
    ['a timestamp from the distant past', 0],
  ])('rejects %s', (_label, timestamp) => {
    expect(() =>
      assertSignedRequestTimestampIsFresh(String(timestamp)),
    ).toThrow(InvalidSignedRequestError);
  });

  it.each([['not-a-number'], ['1.5'], [''], ['1e13']])(
    'rejects a malformed timestamp %p',
    (timestamp) => {
      expect(() => assertSignedRequestTimestampIsFresh(timestamp)).toThrow(
        InvalidSignedRequestError,
      );
    },
  );
});
