import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { SignedRequestReplayGuard } from './SignedRequestReplayGuard';

export function assertSignedRequestTimestampIsFresh(timestamp: string): void {
  const parsedTimestamp = Number(timestamp);
  const now = Date.now();

  if (
    !Number.isInteger(parsedTimestamp) ||
    Math.abs(now - parsedTimestamp) > SignedRequestReplayGuard.MAX_CLOCK_SKEW_MS
  ) {
    throw new InvalidSignedRequestError();
  }
}
