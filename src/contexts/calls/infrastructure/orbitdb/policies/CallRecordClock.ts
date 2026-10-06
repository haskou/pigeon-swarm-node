import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';

/** Author-claimed times are bounded so nobody can pre-date records into the future. */
export class CallRecordClock {
  public static readonly MAX_FUTURE_MS = 10 * 60_000;

  public static assertNotInFuture(value: unknown): void {
    if (
      !Number.isSafeInteger(value) ||
      (value as number) < 0 ||
      (value as number) > Date.now() + CallRecordClock.MAX_FUTURE_MS
    ) {
      throw new InvalidPublicMutationError();
    }
  }
}
