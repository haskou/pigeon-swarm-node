import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidDiagnosticsEntryError } from '../errors/InvalidDiagnosticsEntryError';

/**
 * One already-redacted diagnostics line.
 */
export class DiagnosticsEntry extends StringValueObject {
  public static readonly MAX_LENGTH = 2_000;

  constructor(value: string | StringValueObject) {
    super(value, Number.MAX_SAFE_INTEGER);
    assert(
      this.valueOf().length > 0 &&
        this.valueOf().length <= DiagnosticsEntry.MAX_LENGTH,
      new InvalidDiagnosticsEntryError(DiagnosticsEntry.MAX_LENGTH),
    );
  }
}
