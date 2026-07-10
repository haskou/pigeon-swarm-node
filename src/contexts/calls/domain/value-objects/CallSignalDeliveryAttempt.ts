import { Integer, NumberValueObject, assert } from '@haskou/value-objects';

import { InvalidCallSignalDeliveryAttemptError } from '../errors/InvalidCallSignalDeliveryAttemptError';

export class CallSignalDeliveryAttempt extends Integer {
  private static readonly RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

  public static first(): CallSignalDeliveryAttempt {
    return new CallSignalDeliveryAttempt(1);
  }

  constructor(value: number | NumberValueObject) {
    super(value);

    assert(
      this.isGreaterThan(0) &&
        this.isLessOrEqualThan(
          CallSignalDeliveryAttempt.RETRY_DELAYS_MS.length + 1,
        ),
      new InvalidCallSignalDeliveryAttemptError(),
    );
  }

  public canRetry(): boolean {
    return this.isLessOrEqualThan(
      CallSignalDeliveryAttempt.RETRY_DELAYS_MS.length,
    );
  }

  public next(): CallSignalDeliveryAttempt {
    return new CallSignalDeliveryAttempt(this.valueOf() + 1);
  }

  public getRetryDelayMs(): number {
    return CallSignalDeliveryAttempt.RETRY_DELAYS_MS[this.valueOf() - 1] ?? 0;
  }
}
