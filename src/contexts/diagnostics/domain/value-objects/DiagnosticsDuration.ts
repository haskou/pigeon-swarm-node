import { assert, Integer, NumberValueObject } from '@haskou/value-objects';

import { InvalidDiagnosticsDurationError } from '../errors/InvalidDiagnosticsDurationError';

/**
 * Minutes a diagnostics session keeps recording.
 */
export class DiagnosticsDuration extends Integer {
  public static readonly MIN_MINUTES = 1;
  public static readonly MAX_MINUTES = 60;

  constructor(value: number | NumberValueObject) {
    super(value);
    assert(
      this.valueOf() >= DiagnosticsDuration.MIN_MINUTES &&
        this.valueOf() <= DiagnosticsDuration.MAX_MINUTES,
      new InvalidDiagnosticsDurationError(
        DiagnosticsDuration.MIN_MINUTES,
        DiagnosticsDuration.MAX_MINUTES,
      ),
    );
  }
}
